require("dotenv").config();
const moment = require("moment");
const nodemailer = require("nodemailer");
const mysql = require("mysql");
let aws = require("aws-sdk"),
  s3 = new aws.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER, // Brevo's SMTP server
  port: process.env.SMTP_PORT, // Use port 587 for TLS
  auth: {
    user: process.env.SMTP_USER, // Your SMTP user
    pass: process.env.SMTP_PASSWORD, // Your SMTP password
  },
});

const dateConversion = () => {
  const formattedDate = moment().format("YYYY-MM-DD HH:mm:ss");
  return formattedDate;
};

function convertObjectToProcedureParams(data) {
  // Check if data is defined and not null
  if (data === undefined || data === null) {
    return null; // or return a default value if needed
  }

  // Extract the keys and values from the object
  const entries = Object.entries(data);

  // Convert each entry to the desired format
  const formattedEntries = entries.map(([key, value]) => {
    // Check if the value is a string
    if (typeof value === "string") {
      return `${key} = "${mysql.escape(value).slice(1, -1)}"`;
    } else {
      return `${key} = '${value}'`;
    }
  });

  // Join the formatted entries with commas
  const formattedParams = formattedEntries.join(", ");

  return formattedParams;
}

const UploadS3File = async (params) => {
  let result = await s3.upload(params).promise();
  return result;
};

const generateOTP = () => {
  const digits = "0123456789";
  let OTP = "";
  for (let i = 0; i < 4; i++) {
    OTP += digits[Math.floor(Math.random() * 10)];
  }
  return OTP;
};

const capitalizeEachWord = (str) => {
  if (typeof str !== "string") {
    throw new TypeError("Expected a string as input");
  }

  return str
    .split(" ")
    .map((word) => {
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
};

module.exports = {
  transporter,
  dateConversion,
  convertObjectToProcedureParams,
  UploadS3File,
  generateOTP,
  capitalizeEachWord,
};
