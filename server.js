console.log("🔥 BACKEND RODANDO (VERSÃO OTIMIZADA)");

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// 🔥 MEMÓRIA (trocar por banco depois)
const pagamentos = {};

// 🔐 TOKEN VIA ENV
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;


// ========================================
// 🟢 ROTA ANTI-SLEEP (IMPORTANTE)
// ========================================
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});


// ========================================
// 💰 CRIAR PAGAMENTO PIX
// ========================================
app.post("/criar-pagamento", async (req, res) => {
  const { valor, plano, pixel_id, pixel_token, mp_access_token, email } = req.body;

  try {
    const token = mp_access_token || ACCESS_TOKEN;

    if (!token) {
      return res.status(400).json({ error: "Token Mercado Pago não fornecido" });
    }

    const response = await axios({
      method: "post",
      url: "https://api.mercadopago.com/v1/payments",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": Math.random().toString(36).substring(2)
      },
      data: {
        transaction_amount: Number(valor),
        description: plano,
        payment_method_id: "pix",
        payer: {
          email: email || "teste@teste.com"
        },
        metadata: {
          plano,
          pixel_id,
          pixel_token,
          mp_access_token: token
        }
      }
    });

    const pix = response.data.point_of_interaction.transaction_data;

    // 🔥 salva status
    pagamentos[response.data.id] = {
      status: "pending"
    };

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
// 🔔 WEBHOOK MERCADO PAGO
// ========================================
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;

    if (data.type === "payment") {
      const paymentId = data.data.id;

      // 🔥 tenta pegar token dinâmico (melhor que fixo)
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
        console.log("✅ PAGAMENTO APROVADO:", paymentId);

        pagamentos[paymentId] = {
          status: "approved",
          valor: payment.transaction_amount
        };

        const pixel_id = payment.metadata?.pixel_id;
        const pixel_token = payment.metadata?.pixel_token;

        // 🔥 DISPARO PIXEL
        if (pixel_id && pixel_token) {
          await axios.post(
            `https://graph.facebook.com/v17.0/${pixel_id}/events?access_token=${pixel_token}`,
            {
              data: [
                {
                  event_name: "Purchase",
                  event_time: Math.floor(Date.now() / 1000),
                  action_source: "website",
                  user_data: {
                    client_ip_address: req.ip,
                    client_user_agent: req.headers["user-agent"],
                  },
                  custom_data: {
                    currency: "BRL",
                    value: payment.transaction_amount,
                  },
                },
              ],
            }
          );

          console.log("🔥 PIXEL ENVIADO");
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
// 📊 STATUS (LOVABLE)
// ========================================
app.get("/status/:id", (req, res) => {
  const pagamento = pagamentos[req.params.id];

  if (!pagamento) {
    return res.json({ status: "pending" });
  }

  res.json(pagamento);
});


// ========================================
// 🚀 START SERVER
// ========================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});