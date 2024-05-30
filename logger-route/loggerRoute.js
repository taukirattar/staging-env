const express = require("express");
const router = express.Router();
const rfs = require("rotating-file-stream");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");

const logDirectory = path.join(process.cwd(), "log");

if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true }); // Create the directory if it doesn't exist
}

const consoleLogStream = rfs.createStream("error-console-logs", {
  interval: "1d", // rotate daily
  path: logDirectory,
});

const originalConsoleLog = console.log;

console.log = function (message) {
  const utcTime = new Date();
  const istTime = new Date(utcTime.getTime() + 5.5 * 60 * 60 * 1000); // Add 5 hours and 30 minutes
  const istTimeString = istTime
    .toISOString()
    .replace("T", " ")
    .replace("Z", ""); // Convert to string and remove 'T' and 'Z'
  originalConsoleLog(`${istTimeString} - ${message}`);
  consoleLogStream.write(`${istTimeString} - ${message}\n`); // Log to the file with IST time
  // originalConsoleLog(message); // Log to the console
  // consoleLogStream.write(`${new Date().toISOString()} - ${message}\n`); // Log to the file
};

const deleteOldLogs = () => {
  const files = fs.readdirSync(logDirectory);
  const now = Date.now();

  files.forEach((file) => {
    const filePath = path.join(logDirectory, file);
    const fileStat = fs.statSync(filePath);
    // const fileAge = (now - fileStat.mtimeMs) / (1000 * 60 * 60 * 24); // Age in days
    const fileAge = (now - fileStat.mtimeMs) / (1000 * 60); // Age in minutes

    if (fileAge > 10) {
      // Older than 30 days
      fs.unlinkSync(filePath);
      console.log(`Deleted old log file: ${file}`);
    }
  });
};

// cron.schedule("0 0 * * *", () => {
//   console.log("Running daily log cleanup");
//   deleteOldLogs();
// });

// cron.schedule("*/10 * * * *", () => {
//   console.log("Running log cleanup every 10 minutes");
//   deleteOldLogs();
// });

router.post("/api/logger", async (req, res) => {
  const { message } = req.body;
  try {
    console.log(message);
    res
      .status(200)
      .json({ message: "error message added to log successfully" });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

module.exports = router;
