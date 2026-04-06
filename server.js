console.log("🔥 NOVA VERSÃO DO BACKEND RODANDO");

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// 🔥 TOKEN PADRÃO (fallback)
const ACCESS_TOKEN = "APP_USR-72378658-cb9e-481a-bba1-940d95b54d1e";

// 🔥 CRIAR PAGAMENTO PIX
app.post("/criar-pagamento", async (req, res) => {
  console.log("BODY:", req.body);

  const { valor, plano, pixel_id, pixel_token, mp_access_token, email } = req.body;

  try {
    const response = await axios({
      method: "post",
      url: "https://api.mercadopago.com/v1/payments",
      headers: {
  Authorization: `Bearer ${mp_access_token || ACCESS_TOKEN}`,
  "Content-Type": "application/json",
  "X-Idempotency-Key": Math.random().toString(36).substring(2)
}
      data: {
        transaction_amount: Number(valor),
        description: plano,
        payment_method_id: "pix",
        payer: {
          email: email || "teste@teste.com" // 🔥 importante
        },
        metadata: {
          plano,
          pixel_id,
          pixel_token,
          mp_access_token
        }
      }
    });

    const pix = response.data.point_of_interaction.transaction_data;

    res.json({
      pix_code: pix.qr_code,
      qr_code: pix.qr_code_base64
    });

  } catch (error) {
    console.log("ERRO PIX:", error.response?.data || error.message);
    res.status(500).json({ error: "Erro ao gerar PIX" });
  }
});

// 🔥 WEBHOOK
app.post("/webhook", async (req, res) => {
  const data = req.body;

  try {
    if (data.type === "payment") {
      const paymentId = data.data.id;

      let payment;

      try {
        const response = await axios.get(
          `https://api.mercadopago.com/v1/payments/${paymentId}`,
          {
            headers: {
              Authorization: `Bearer ${ACCESS_TOKEN}`,
            },
          }
        );

        payment = response.data;
      } catch (err) {
        console.log("Pagamento não encontrado (teste MP)");
        return res.sendStatus(200);
      }

      if (payment.status === "approved") {
        console.log("PAGAMENTO APROVADO");

        const pixel_id = payment.metadata?.pixel_id;
        const pixel_token = payment.metadata?.pixel_token;

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

          console.log("PIXEL ENVIADO:", pixel_id);
        } else {
          console.log("Pixel não encontrado no metadata");
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.log("ERRO WEBHOOK:", error.message);
    res.sendStatus(500);
  }
});

// 🔥 START
app.listen(3000, () => {
  console.log("Servidor rodando");
});