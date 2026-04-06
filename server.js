const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const ACCESS_TOKEN = "APP_USR-3748734251896118-040521-beb30608163e897f56a935df8bc8f612-3316391333";

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

app.listen(3000, () => {
  console.log("Servidor rodando em http://localhost:3000");
});