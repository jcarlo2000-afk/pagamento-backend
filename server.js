console.log("🔥 BACKEND RODANDO (PIX + CARTÃO)");

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const crypto = require("crypto");

const app = express();


// ========================================
// ✅ CORS COMPLETO
// ========================================
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options(/.*/, cors());

app.use(express.json());


// ========================================
// ✅ VARIÁVEIS
// ========================================
const pagamentos = {};

// 🚫 CONTROLE IC DUPLICADO
const icEnviado = {};

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;


// ========================================
// ❤️ HEALTH
// ========================================
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});


// ========================================
// 💰 PIX
// ========================================
app.post("/criar-pagamento", async (req, res) => {

  const {
    valor,
    plano,
    pixel_id,
    pixel_token,
    mp_access_token,
    email
  } = req.body;

  try {

    const token = mp_access_token || ACCESS_TOKEN;

    if (!token) {
      console.log("❌ ACCESS TOKEN NÃO ENCONTRADO");

      return res.status(500).json({
        error: "ACCESS_TOKEN não configurado"
      });
    }

    const emailFinal =
      email && email !== ""
        ? email
        : "teste@gmail.com";

    console.log("📩 EMAIL PIX:", emailFinal);

    // ========================================
    // 🔥 MERCADO PAGO PIX
    // ========================================
    const response = await axios.post(
      "https://api.mercadopago.com/v1/payments",
      {
        transaction_amount: Number(valor),

        description: plano || "Pagamento",

        payment_method_id: "pix",

        payer: {
          email: emailFinal
        },

        metadata: {
          plano,
          pixel_id,
          pixel_token
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": Date.now().toString()
        }
      }
    );

    console.log("✅ PIX CRIADO");


    // ========================================
    // 💾 SALVAR NO SUPABASE
    // ========================================
    await axios.post(
      "https://frjoahehjmgsfojkyeej.supabase.co/functions/v1/save-payment",
      {
        payment_id: response.data.id.toString(),
        email: emailFinal,
        valor: Number(valor),
        plano: plano || "Plano",
        status: "pending",
        metodo: "pix",
        template: plano || "default"
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": process.env.WEBHOOK_SECRET
        }
      }
    );

    console.log("💾 PAGAMENTO SALVO NO SUPABASE");


    const pix =
      response.data.point_of_interaction
        .transaction_data;

    pagamentos[response.data.id] = {
      status: "pending",
      mp_access_token: token
    };


    // ========================================
    // 🔥 FACEBOOK IC
    // ========================================
    if (pixel_id && pixel_token) {

      // 🚫 BLOQUEIA IC DUPLICADO
      const chaveIC =
        `${emailFinal}_${pixel_id}`;

      if (!icEnviado[chaveIC]) {

        icEnviado[chaveIC] = true;

        const emailHash = crypto
          .createHash("sha256")
          .update(emailFinal.trim().toLowerCase())
          .digest("hex");

        axios.post(
          `https://graph.facebook.com/v17.0/${pixel_id}/events`,
          {
            data: [
              {
                event_name: "InitiateCheckout",

                event_time:
                  Math.floor(Date.now() / 1000),

                action_source: "website",

                user_data: {
                  em: [emailHash]
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
        )
        .then(() => {
          console.log("🔥 IC EVENT ENVIADO");
        })
        .catch((err) => {
          console.log(
            "⚠️ ERRO FACEBOOK:",
            err.response?.data || err.message
          );
        });

      } else {

        console.log(
          "⚠️ IC JÁ ENVIADO NESTA SESSÃO"
        );

      }
    }


    // ========================================
    // ✅ RESPOSTA PIX
    // ========================================
    res.json({
      pix_code: pix.qr_code,
      qr_code: pix.qr_code_base64,
      payment_id: response.data.id
    });

  } catch (error) {

    console.log(
      "❌ ERRO PIX:",
      error.response?.data || error.message
    );

    res.status(500).json({
      error: "Erro ao gerar PIX",
      details: error.response?.data || error.message
    });
  }
});


// ========================================
// 💳 CARTÃO
// ========================================
app.post("/pagar-cartao", async (req, res) => {

  const {
    token,
    valor,
    email,
    mp_access_token,
    pixel_id,
    pixel_token
  } = req.body;

  try {

    const tokenMP =
      mp_access_token || ACCESS_TOKEN;

    if (!tokenMP) {

      return res.status(500).json({
        error: "ACCESS_TOKEN não configurado"
      });
    }


    // ========================================
    // 🔥 FACEBOOK IC CARTÃO
    // ========================================
    if (pixel_id && pixel_token) {

      // 🚫 BLOQUEIA IC DUPLICADO
      const chaveIC =
        `${email}_${pixel_id}`;

      if (!icEnviado[chaveIC]) {

        icEnviado[chaveIC] = true;

        const emailHash = crypto
          .createHash("sha256")
          .update(email.trim().toLowerCase())
          .digest("hex");

        axios.post(
          `https://graph.facebook.com/v17.0/${pixel_id}/events`,
          {
            data: [
              {
                event_name: "InitiateCheckout",

                event_time:
                  Math.floor(Date.now() / 1000),

                action_source: "website",

                user_data: {
                  em: [emailHash]
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
        )
        .then(() => {
          console.log("🔥 IC CARTÃO ENVIADO");
        })
        .catch((err) => {
          console.log(
            "⚠️ ERRO IC CARTÃO:",
            err.response?.data || err.message
          );
        });

      } else {

        console.log(
          "⚠️ IC JÁ ENVIADO NESTA SESSÃO"
        );

      }
    }


    // ========================================
    // 💳 MERCADO PAGO CARTÃO
    // ========================================
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
          pixel_token
        }
      },
      {
        headers: {
          Authorization: `Bearer ${tokenMP}`,
          "Content-Type": "application/json"
        }
      }
    );

    const payment = response.data;

    pagamentos[payment.id] = {
      status: payment.status,
      valor: payment.transaction_amount
    };

    res.json({
      status: payment.status
    });

  } catch (error) {

    console.log(
      "❌ ERRO CARTÃO:",
      error.response?.data || error.message
    );

    res.status(500).json({
      error: "Erro ao pagar com cartão",
      details: error.response?.data || error.message
    });
  }
});


// ========================================
// 🚀 STATUS
// ========================================
app.get("/status/:id", async (req, res) => {

  const { id } = req.params;

  try {

    const pagamento = pagamentos[id];

    if (!pagamento) {

      return res.json({
        status: "pending"
      });
    }

    const response = await axios.get(
      `https://api.mercadopago.com/v1/payments/${id}`,
      {
        headers: {
          Authorization:
            `Bearer ${pagamento.mp_access_token || ACCESS_TOKEN}`
        }
      }
    );

    res.json({
      status: response.data.status
    });

  } catch (error) {

    console.log(
      "❌ ERRO STATUS:",
      error.response?.data || error.message
    );

    res.status(500).json({
      error: "Erro ao consultar status"
    });
  }
});


// ========================================
// 🔔 WEBHOOK
// ========================================
app.post("/webhook", async (req, res) => {

  try {

    const paymentId = req.body?.data?.id;

    if (!paymentId) {
      return res.sendStatus(200);
    }

    console.log("🔔 WEBHOOK:", paymentId);

    const response = await axios.get(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`
        }
      }
    );

    const payment = response.data;

    pagamentos[payment.id] = {
      status: payment.status,
      valor: payment.transaction_amount
    };


    // ========================================
    // 💾 UPDATE SUPABASE
    // ========================================
    await axios.post(
      "https://frjoahehjmgsfojkyeej.supabase.co/functions/v1/save-payment",
      {
        payment_id: payment.id.toString(),
        email: payment.payer?.email || "",
        valor: Number(payment.transaction_amount),
        plano: payment.description || "Plano",
        status: payment.status,
        metodo: payment.payment_method_id || "pix",
        template: payment.description || "default"
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": process.env.WEBHOOK_SECRET
        }
      }
    );

    console.log("💾 STATUS ATUALIZADO NO SUPABASE");


    const pixel_id =
      payment.metadata?.pixel_id;

    const pixel_token =
      payment.metadata?.pixel_token;

    if (
      payment.status === "approved" &&
      pixel_id &&
      pixel_token
    ) {

      axios.post(
        `https://graph.facebook.com/v17.0/${pixel_id}/events`,
        {
          data: [
            {
              event_name: "Purchase",

              event_time:
                Math.floor(Date.now() / 1000),

              action_source: "website",

              custom_data: {
                currency: "BRL",
                value: Number(payment.transaction_amount),
              },
            },
          ],
        },
        {
          params: {
            access_token: pixel_token,
          },
        }
      )
      .then(() => {
        console.log("🔥 PURCHASE ENVIADO");
      })
      .catch((err) => {
        console.log(
          "⚠️ ERRO PURCHASE:",
          err.response?.data || err.message
        );
      });

    }

    res.sendStatus(200);

  } catch (error) {

    console.log(
      "❌ ERRO WEBHOOK:",
      error.response?.data || error.message
    );

    res.sendStatus(500);
  }
});


// ========================================
// 🚀 START SERVER
// ========================================
const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
