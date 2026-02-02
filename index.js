const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;

//middleware-->>

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.stwfv7r.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    // Send a ping to confirm a successful connection

    const queriesCollection = client
      .db("productRecommendation")
      .collection("queries");

    const recommendationsCollection = client
      .db("productRecommendation")
      .collection("recommendations");

    app.get("/", (req, res) => {
      res.send("working");
    });

    //find all-->>

    app.get("/queries", async (req, res) => {
      const result = await queriesCollection.find({}).toArray();
      res.send(result);
    });

    //findOne-->>

    app.get("/queries/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await queriesCollection.findOne(query);
      res.send(result);
    });

    //post a query-->>

    app.post("/queries", async (req, res) => {
      const data = req.body;
      console.log(data);
      const newData = {
        ...data,
        createdAt: new Date(),
        recommendationCount: 0,
      };
      const result = await queriesCollection.insertOne(newData);
      res.send(result);
    });

    //myQueries-->>>

    app.get("/my-queries", async (req, res) => {
      const email = req.query.email;
      console.log(email);
      const query = { userEmail: email };
      const result = await queriesCollection.find(query).toArray();
      console.log(result);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log("app is running at port", port);
});
