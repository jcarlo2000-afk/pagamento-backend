console.log("🔥 BACKEND RODANDO (PIX + CARTÃO)");

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// 🔥 MEMÓRIA (trocar por banco depois)
const pagamentos = {};

// 🔐 TOKEN PADRÃO
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;


// ========================================
// 🟢 ROTA ANTI-SLEEP
// ========================================
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});


// ========================================
// 💰 PIX
// ========================================
app.post("/criar-pagamento", async (req, res) => {
  const { valor, plano, pixel_id, pixel_token, mp_access_token, email } = req.body;

  try {
    const token = mp_access_token || ACCESS_TOKEN;

    const emailFinal = email && email !== "" ? email : "teste@gmail.com";

    console.log("EMAIL PIX:", emailFinal);

    const response = await axios.post(
      "https://api.mercadopago.com/v1/payments",
      {
        transaction_amount: Number(valor),
        description: plano,
        payment_method_id: "pix",
        payer: {
          email: emailFinal
        },
        metadata: {
          plano,
          pixel_id,
          pixel_token,
          mp_access_token: token
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Idempotency-Key": Math.random().toString(36)
        }
      }
    );

    const pix = response.data.point_of_interaction.transaction_data;

    pagamentos[response.data.id] = {
      status: "pending",
      mp_access_token: token
    };

    // 🔥 IC EVENT (PROTEGIDO)
    if (pixel_id && pixel_token) {
      try {
        await axios.post(
          `https://graph.facebook.com/v17.0/${pixel_id}/events?access_token=${pixel_token}`,
          {
            data: [
              {
                event_name: "InitiateCheckout",
                event_time: Math.floor(Date.now() / 1000),
                action_source: "website",
                custom_data: {
                  currency: "BRL",
                  value: Number(valor),
                },
              },
            ],
          }
        );

        console.log("🔥 IC EVENT ENVIADO");
      } catch (err) {
        console.log("⚠️ ERRO AO ENVIAR IC:", err.message);
      }
    }

    res.json({
      pix_code: pix.qr_code,
      qr_code: pix.qr_code_base64,
      payment_id: response.data.id
    });

  } catch (error) {
    console.log("❌ ERRO PIX:", error.response?.data || error.message);
    res.status(500).json({ error: "Erro ao gerar PIX" });
  }
});


// ========================================
// 💳 CARTÃO
// ========================================
app.post("/pagar-cartao", async (req, res) => {
  const { token, valor, email, mp_access_token, pixel_id, pixel_token } = req.body;

  try {
    const tokenMP = mp_access_token || ACCESS_TOKEN;

    // 🔥 IC CARTÃO (PROTEGIDO)
    if (pixel_id && pixel_token) {
      try {
        await axios.post(
          `https://graph.facebook.com/v17.0/${pixel_id}/events?access_token=${pixel_token}`,
          {
            data: [
              {
                event_name: "InitiateCheckout",
                event_time: Math.floor(Date.now() / 1000),
                action_source: "website",
                custom_data: {
                  currency: "BRL",
                  value: Number(valor),
                },
              },
            ],
          }
        );

        console.log("🔥 IC CARTÃO ENVIADO");
      } catch (err) {
        console.log("⚠️ ERRO IC CARTÃO:", err.message);
      }
    }

    const response = await axios.post(
      "https://api.mercadopago.com/v1/payments",
      {
        transaction_amount: Number(valor),
        token: token,
        description: "Pagamento com cartão",
        installments: 1,
        payment_method_id: "credit_card",
        payer: {
          email: email
        },
        metadata: {
          pixel_id,
          pixel_token,
          mp_access_token: tokenMP
        }
      },
      {
        headers: {
          Authorization: `Bearer ${tokenMP}`
        }
      }
    );

    const payment = response.data;

    pagamentos[payment.id] = {
      status: payment.status,
      valor: payment.transaction_amount,
      mp_access_token: tokenMP
    };

    if (payment.status === "approved" && pixel_id && pixel_token) {
      try {
        await axios.post(
          `https://graph.facebook.com/v17.0/${pixel_id}/events?access_token=${pixel_token}`,
          {
            data: [
              {
                event_name: "Purchase",
                event_time: Math.floor(Date.now() / 1000),
                action_source: "website",
                custom_data: {
                  currency: "BRL",
                  value: payment.transaction_amount,
                },
              },
            ],
          }
        );

        console.log("🔥 PIXEL CARTÃO ENVIADO");
      } catch (err) {
        console.log("⚠️ ERRO PIXEL CARTÃO:", err.message);
      }
    }

    res.json({
      status: payment.status
    });

  } catch (error) {
    console.log("❌ ERRO CARTÃO:", error.response?.data || error.message);
    res.status(500).json({ error: "Erro ao pagar com cartão" });
  }
});


// ========================================
// 🔔 WEBHOOK
// ========================================
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;

    if (data.type === "payment") {
      const paymentId = data.data.id;

      const pagamentoSalvo = pagamentos[paymentId];
      const token = pagamentoSalvo?.mp_access_token || ACCESS_TOKEN;

      const response = await axios.get(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const payment = response.data;

      if (payment.status === "approved") {
        pagamentos[paymentId] = {
          status: "approved",
          valor: payment.transaction_amount
        };

        const pixel_id = payment.metadata?.pixel_id;
        const pixel_token = payment.metadata?.pixel_token;

        if (pixel_id && pixel_token) {
          try {
            await axios.post(
              `https://graph.facebook.com/v17.0/${pixel_id}/events?access_token=${pixel_token}`,
              {
                data: [
                  {
                    event_name: "Purchase",
                    event_time: Math.floor(Date.now() / 1000),
                    action_source: "website",
                    custom_data: {
                      currency: "BRL",
                      value: payment.transaction_amount,
                    },
                  },
                ],
              }
            );

            console.log("🔥 PIXEL PIX ENVIADO");
          } catch (err) {
            console.log("⚠️ ERRO PIXEL PIX:", err.message);
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.log("❌ ERRO WEBHOOK:", error.message);
    res.sendStatus(500);
  }
});


// ========================================
// 📊 STATUS
// ========================================
app.get("/status/:id", (req, res) => {
  const pagamento = pagamentos[req.params.id];

  if (!pagamento) {
    return res.json({ status: "pending" });
  }

  res.json(pagamento);
});


// ========================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});
