const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
var admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_JSON);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;

//middleware-->>

app.use(
  cors({
    origin: ["http://localhost:5173", ""],
    credentials: true,
  }),
);

app.use(express.json());

//auth-->>

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).send({ message: "Unauthorized Access !" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).send({ message: "Unauthorized Access !" });
    }

    const userInfo = await admin.auth().verifyIdToken(token);
    req.tokenEmail = userInfo.email;

    next();
  } catch (err) {
    return res.status(401).send({ message: "Invalid Token !" });
  }
};

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
      try {
        const search = req.query.search?.trim();

        const filter = search
          ? { productName: { $regex: search, $options: "i" } }
          : {};

        const result = await queriesCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (err) {
        console.log(err);
        res.status(500).send({ message: "Failed to Fetch Query" });
      }
    });

    //findOne-->>

    app.get("/queries/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await queriesCollection.findOne(query);
      res.send(result);
    });

    //post a query-->>

    app.post("/queries", verifyFirebaseToken, async (req, res) => {
      const data = req.body;

      const newData = {
        ...data,
        userEmail: req.tokenEmail,
        createdAt: new Date(),
        recommendationCount: 0,
      };
      const result = await queriesCollection.insertOne(newData);
      res.send(result);
    });

    //myQueries-->>>

    app.get("/my-queries", verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;
      if (req.tokenEmail != email) {
        return res.status(403).send({ message: "forbidden access !" });
      }
      // console.log(email);
      const query = { userEmail: email };
      const result = await queriesCollection.find(query).toArray();
      // console.log(result);
      res.send(result);
    });

    //delete queries-->>

    app.delete("/queries/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };

        const queryDoc = await queriesCollection.findOne(query);
        if (!queryDoc) {
          return res.status(404).send({ message: " Query not found !" });
        }

        if (queryDoc.userEmail !== req.tokenEmail) {
          return res.status(403).send({ message: " Forbidden Access !" });
        }

        const result = await queriesCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(400).send({ message: "Query not found" });
        }

        // delete all recommendations for this query
        await recommendationsCollection.deleteMany({ queryId: id });
        res.send(result);
      } catch (err) {
        console.log(err);
        res.status(500).send({ message: "Failed to Delete Query" });
      }
    });

    //update queries--->>

    app.patch("/queries/:id", verifyFirebaseToken, async (req, res) => {
      const { id } = req.params;
      const data = req.body;

      const query = { _id: new ObjectId(id) };

      const queryDoc = await queriesCollection.findOne(query);
      if (!queryDoc) {
        return res.status(404).send({ message: " Query not found !" });
      }

      if (queryDoc.userEmail !== req.tokenEmail) {
        return res.status(403).send({ message: " Forbidden Access !" });
      }

      //safety
      delete data.createdAt;
      delete data.recommendationCount;
      delete data.userEmail;
      delete data.userName;
      delete data.userPhoto;

      const updatedData = { $set: data };

      const result = await queriesCollection.updateOne(query, updatedData);

      res.send(result);
    });

    //insert recommendation-->>

    app.post("/recommendations", verifyFirebaseToken, async (req, res) => {
      try {
        const data = req.body;
        const newData = {
          ...data,
          recommenderEmail: req.tokenEmail,
          createdAt: new Date(),
        };
        const result = await recommendationsCollection.insertOne(newData);

        const updateQuery = await queriesCollection.updateOne(
          { _id: new ObjectId(data.queryId) },
          { $inc: { recommendationCount: 1 } },
        );

        res.send(result);
      } catch (err) {
        console.log(err);
        res.status(500).send({ message: " Failed to add recommendation" });
      }
    });

    // show recommendation-->>

    app.get("/recommendations", async (req, res) => {
      try {
        const queryId = req.query.queryId;
        const filter = queryId ? { queryId } : {};

        const result = await recommendationsCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (err) {
        console.log(err);
        res.status(500).send({ message: "Failed to fetch recommendations" });
      }
    });

    app.delete(
      "/recommendations/:id",
      verifyFirebaseToken,
      async (req, res) => {
        try {
          const id = req.params.id;

          // 1) find recommendation to get queryId
          const rec = await recommendationsCollection.findOne({
            _id: new ObjectId(id),
          });
          if (!rec)
            return res
              .status(404)
              .send({ message: "Recommendation not found" });

          // 2) delete recommendation
          const result = await recommendationsCollection.deleteOne({
            _id: new ObjectId(id),
          });

          // 3) decrease recommendationCount
          await queriesCollection.updateOne(
            { _id: new ObjectId(rec.queryId) },
            { $inc: { recommendationCount: -1 } },
          );

          res.send(result);
        } catch (err) {
          console.log(err);
          res.status(500).send({ message: "Failed to delete recommendation" });
        }
      },
    );

    //my recommendations-->>

    app.get("/my-recommendations", verifyFirebaseToken, async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }

        if (req.tokenEmail !== email) {
          return res.status(403).send({ message: "Forbidden" });
        }

        const result = await recommendationsCollection
          .find({ recommenderEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (err) {
        console.log(err);
        res.status(500).send({ message: "Failed to fetch my recommendations" });
      }
    });

    //recommendation for me -->>

    app.get(
      "/recommendations-for-me",
      verifyFirebaseToken,
      async (req, res) => {
        try {
          const email = req.query.email;

          if (!email) {
            return res.status(400).send({ message: "Email is required" });
          }
          if (req.tokenEmail !== email) {
            return res.status(403).send({ message: "Forbidden" });
          }

          const result = await recommendationsCollection
            .find({ userEmail: email })
            .sort({ createdAt: -1 })
            .toArray();

          res.send(result);
        } catch (err) {
          console.log(err);
          res
            .status(500)
            .send({ message: "Failed to fetch recommendations for me" });
        }
      },
    );

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
