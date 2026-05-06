console.log("🔥 BACKEND RODANDO (PIX + CARTÃO)");

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const pagamentos = {};
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;


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
        payer: { email: emailFinal },
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

    // 🔥 IC EVENT CORRIGIDO
    if (pixel_id && pixel_token) {
      try {
        await axios.post(
          `https://graph.facebook.com/v17.0/${pixel_id}/events`,
          {
            data: [
              {
                event_name: "InitiateCheckout",
                event_time: Math.floor(Date.now() / 1000),
                action_source: "website",
                user_data: {
                  em: [emailFinal]
                },
                custom_data: {
                  currency: "BRL",
                  value: Number(valor),
                },
              },
            ],
          },
          {
            params: {
              access_token: pixel_token,
            },
          }
        );

        console.log("🔥 IC EVENT ENVIADO");
      } catch (err) {
        console.log("⚠️ ERRO IC:", err.response?.data || err.message);
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

    // 🔥 IC NO CARTÃO
    if (pixel_id && pixel_token) {
      try {
        await axios.post(
          `https://graph.facebook.com/v17.0/${pixel_id}/events`,
          {
            data: [
              {
                event_name: "InitiateCheckout",
                event_time: Math.floor(Date.now() / 1000),
                action_source: "website",
                user_data: {
                  em: [email]
                },
                custom_data: {
                  currency: "BRL",
                  value: Number(valor),
                },
              },
            ],
          },
          {
            params: {
              access_token: pixel_token,
            },
          }
        );

        console.log("🔥 IC CARTÃO ENVIADO");
      } catch (err) {
        console.log("⚠️ ERRO IC CARTÃO:", err.response?.data || err.message);
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
        payer: { email: email },
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
          `https://graph.facebook.com/v17.0/${pixel_id}/events`,
          {
            data: [
              {
                event_name: "Purchase",
                event_time: Math.floor(Date.now() / 1000),
                action_source: "website",
                user_data: {
                  em: [email]
                },
                custom_data: {
                  currency: "BRL",
                  value: payment.transaction_amount,
                },
              },
            ],
          },
          {
            params: {
              access_token: pixel_token,
            },
          }
        );

        console.log("🔥 PIXEL CARTÃO ENVIADO");
      } catch (err) {
        console.log("⚠️ ERRO PIXEL CARTÃO:", err.response?.data || err.message);
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
