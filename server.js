const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// 🔥 SEU TOKEN MERCADO PAGO
const ACCESS_TOKEN = "APP_USR-8160232292809421-040611-e64cdfec61c2cb974c5ea3483267af93-444844372";

// 🔥 CRIAR PAGAMENTO
app.post("/criar-pagamento", async (req, res) => {
  const { valor, plano } = req.body;

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
        },
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );

    res.json({
      link: response.data.init_point,
    });
  } catch (error) {
    console.log(error.response?.data || error.message);
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

      // 🔥 PROTEÇÃO PRA NÃO DAR ERRO NO TESTE DO MP
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
        console.log("Pagamento não encontrado (teste do MP)");
        return res.sendStatus(200);
      }

      // 🔥 SE FOI APROVADO
      if (payment.status === "approved") {
        console.log("PAGAMENTO APROVADO");

        // 🔥 ENVIA EVENTO PRO FACEBOOK
        await axios.post(
          `https://graph.facebook.com/v17.0/SEU_PIXEL_ID/events?access_token=SEU_TOKEN_PIXEL`,
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
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.log(error.message);
    res.sendStatus(500);
  }
});

// 🔥 SEMPRE NO FINAL
app.listen(3000, () => {
  console.log("Servidor rodando");
});