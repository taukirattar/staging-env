require("dotenv").config();
const express = require("express");
const router = express.Router();
const pool = require("../config/database");
const { isEmail } = require("validator");
const bcrypt = require("bcrypt");
const mysql = require("mysql");
const { generateToken } = require("../utils/auth");
const {
  dateConversion,
  transporter,
  convertObjectToProcedureParams,
} = require("../utils");
const authMiddleware = require("../middleware/authMiddleware");

//AddEvent
router.post("/api/events/insert-event", authMiddleware, async (req, res) => {
  try {
    const { organizer_id, event_image, event_s3image_content, ...otherFields } =
      req.body;
    const formattedDate = dateConversion();

    let event_image_name = "";
    const time = Math.floor(Date.now() / 1000);
    const fileName = `${time}_${event_image}`;

    if (event_s3image_content) {
      //   const params = {
      //     Bucket: process.env.S3_BUCKET_NAME,
      //     Key: `events_images/${fileName}`,
      //     Body: Buffer.from(event_s3image_content, "base64"),
      //     ContentType: "image/png",
      //     ACL: "public-read",
      //   };
      //   await UPLOAD_HELPER.UploadS3File(params);
      event_image_name = fileName;
    }

    const InputFields = {
      ...otherFields,
      event_image: event_image_name,
      event_status: "active",
      event_created_date: formattedDate,
      organizer_id: organizer_id,
    };

    const paramNamesString = Object.keys(InputFields).join(", ");
    const paramValuesString = Object.values(InputFields)
      .map((value) =>
        typeof value === "string"
          ? `"${mysql.escape(value).slice(1, -1)}"`
          : `'${value}'`
      )
      .join(", ");

    await pool.execute("CALL InsertEvents(?, ?, @inserted_id_result)", [
      paramNamesString,
      paramValuesString,
    ]);

    const [insertedIdResult] = await pool.execute(
      "SELECT @inserted_id_result AS inserted_id"
    );

    const event_inserted_id = insertedIdResult[0].inserted_id;

    const hdata = {
      event_id: event_inserted_id,
      organizer_id: organizer_id,
      event_history_description: `Event added successfully!`,
      event_history_date: formattedDate,
    };

    const hparamNamesString = Object.keys(hdata).join(", ");
    const hparamValuesString = Object.values(hdata)
      .map((value) =>
        typeof value === "string"
          ? `"${mysql.escape(value).slice(1, -1)}"`
          : `'${value}'`
      )
      .join(", ");

    await pool.execute("CALL InsertEventsHistory(?, ?, @inserted_id_result)", [
      hparamNamesString,
      hparamValuesString,
    ]);

    res.status(200).json({
      message: "Added successfully.",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

//UpdateEvent
router.patch("/api/events/update-event", authMiddleware, async (req, res) => {
  try {
    const {
      event_id,
      organizer_id,
      event_image,
      event_s3image_content,
      ...otherFields
    } = req.body;

    const formattedDate = dateConversion();

    const [rows] = await pool.execute("CALL GetEventByID(?)", [event_id]);

    let event_image_name = rows[0][0]?.event_image;

    if (event_image && event_s3image_content) {
      const time = Math.floor(Date.now() / 1000);
      const fileName = `${time}_${event_image}`;

      if (event_s3image_content) {
        //   const params = {
        //     Bucket: process.env.S3_BUCKET_NAME,
        //     Key: `events_images/${fileName}`,
        //     Body: Buffer.from(event_s3image_content, "base64"),
        //     ContentType: "image/png",
        //     ACL: "public-read",
        //   };
        //   await UPLOAD_HELPER.UploadS3File(params);
        event_image_name = fileName;
      }
    }

    const InputFields = {
      ...otherFields,
      event_image: event_image_name,
      event_created_date: formattedDate,
      organizer_id: organizer_id,
    };

    const procedureParams = convertObjectToProcedureParams(InputFields);

    const storedProcedure = "CALL UpdateEvents(?, ?)";
    await pool.execute(storedProcedure, [
      procedureParams,
      `event_id = ${event_id}`,
    ]);

    const hdata = {
      event_id: event_id,
      organizer_id: organizer_id,
      event_history_description: `Event updated successfully!`,
      event_history_date: formattedDate,
    };

    const hparamNamesString = Object.keys(hdata).join(", ");
    const hparamValuesString = Object.values(hdata)
      .map((value) =>
        typeof value === "string"
          ? `"${mysql.escape(value).slice(1, -1)}"`
          : `'${value}'`
      )
      .join(", ");

    await pool.execute("CALL InsertEventsHistory(?, ?, @inserted_id_result)", [
      hparamNamesString,
      hparamValuesString,
    ]);

    res.status(200).json({
      message: "Updated successfully.",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

//DeleteEvent
router.delete(
  "/api/events/delete-event/:event_id/:organizer_id",
  authMiddleware,
  async (req, res) => {
    try {
      const event_id = req.params.event_id;
      const organizer_id = req.params.organizer_id;

      const [rows] = await pool.execute("CALL GetEventByID(?)", [event_id]);

      const formattedDate = dateConversion();

      const del1 = `event_id = '${event_id}'`;
      await pool.execute("CALL DeleteEvents(?)", [del1]);

      const hdata = {
        event_id: event_id,
        organizer_id: organizer_id,
        event_title: rows[0][0]?.event_title,
        event_history_description: `Event deleted successfully!`,
        event_history_date: formattedDate,
      };

      const hparamNamesString = Object.keys(hdata).join(", ");
      const hparamValuesString = Object.values(hdata)
        .map((value) =>
          typeof value === "string"
            ? `"${mysql.escape(value).slice(1, -1)}"`
            : `'${value}'`
        )
        .join(", ");

      await pool.execute(
        "CALL InsertEventsHistory(?, ?, @inserted_id_result)",
        [hparamNamesString, hparamValuesString]
      );

      res.status(200).json({
        message: "Deleted successfully!",
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

//ViewEvents
router.get("/api/events/view-events", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute("CALL ViewAllEvents()");

    const EventLists = rows[0].map((event) => ({
      ...event,
      event_image: event.event_image
        ? `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/events_images/${event.event_image}`
        : "",
    }));

    res.status(200).json(EventLists);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
