const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const ACCESS_TOKEN = "SEU_TOKEN_MP";

// 🔥 CRIAR PAGAMENTO
app.post("/criar-pagamento", async (req, res) => {
console.log("BODY:", req.body); // 👈 COLOCA AQUI
const { valor, plano, pixel_id, pixel_token, mp_access_token } = req.body;
  try {
    const response = await axios.post(
      "https://api.mercadopago.com/checkout/preferences",
      {
        items: [
          {
            title: plano,
            quantity: 1,
            unit_price: Number(valor),
          },
        ],
        metadata: {
          plano: plano,
          pixel_id: pixel_id,
          pixel_token: pixel_token,
          mp_access_token: mp_access_token
        },
      },
      {
        headers: {
          Authorization: `Bearer ${mp_access_token || ACCESS_TOKEN}`,
        },
      }
    );

    res.json({
      link: response.data.init_point,
    });
  } catch (error) {
    console.log("ERRO MP:", error.response?.data || error.message);
    res.status(500).json({ error: "Erro ao criar pagamento" });
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
              const mp_token = payment.metadata?.mp_access_token || ACCESS_TOKEN;

Authorization: `Bearer ${mp_token}`,
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

        // 🔥 PEGA PIXEL DINÂMICO
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

// 🔥 FINAL
app.listen(3000, () => {
  console.log("Servidor rodando");
});