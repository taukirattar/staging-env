require("dotenv").config();
const express = require("express");
const router = express.Router();
const pool = require("../config/database");
const mysql = require("mysql");
const { dateConversion } = require("../utils");
const authMiddleware = require("../middleware/authMiddleware");

//Get Today's 10 Quiz
router.get("/api/quiz/today-10-quiz", authMiddleware, async (req, res) => {
  try {
    const [quiz] = await pool.execute("CALL getTop10Quiz()");
    const quizResult = quiz[0];
    res.status(201).json({ quizResult });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

//Submit Quiz
router.post("/api/quiz/submit-quiz", authMiddleware, async (req, res) => {
  try {
    const {
      userId,
      quizId,
      quizAnswer,
      startTime,
      totalSeconds,
      lastQuestion,
    } = req.body;
    const formattedDate = dateConversion();
    const [quiz] = await pool.execute("CALL getQuizByQId(?)", [quizId]);
    const quizRow = quiz[0][0];
    if (!quizRow) {
      return res.status(400).json({ message: "Invalid Quiz" });
    }
    const [submitted] = await pool.execute("CALL checkSubmittedQuestion(?,?)", [
      userId,
      quizId,
    ]);
    const submittedRow = submitted[0][0];
    if (submittedRow) {
      return res.status(400).json({ message: "Question already submitted" });
    }
    let result = "fail";
    if (quizRow.quiz_answer == quizAnswer) {
      result = "pass";
    }
    const data = {
      dev_id: userId,
      quiz_id: quizId,
      quiz_answer: quizAnswer,
      start_time: startTime,
      total_seconds: totalSeconds,
      result: result,
      submission_date: formattedDate,
    };
    const paramNamesString = Object.keys(data).join(", ");
    const paramValuesString = Object.values(data)
      .map((value) =>
        typeof value === "string"
          ? `"${mysql.escape(value).slice(1, -1)}"`
          : `'${value}'`
      )
      .join(", ");

    const callProcedureSQL = `CALL InsertQuizSubmission(?, ?, @inserted_id_result)`;
    await pool.execute(callProcedureSQL, [paramNamesString, paramValuesString]);

    if (lastQuestion === "yes") {
      const [submission] = await pool.execute("CALL getSubmittedQuestins(?)", [
        userId,
      ]);
      const submissionResult = submission[0];
      let passCount = 0;
      let totalQuizSeconds = 0;
      for (const sr of submissionResult) {
        const seconds = sr.total_seconds;
        if (sr.result == "pass") {
          passCount++;
          totalQuizSeconds += parseInt(seconds);
        }
      }
      const data1 = {
        dev_id: userId,
        total_questions: passCount,
        less_time: totalQuizSeconds,
        result_date: formattedDate,
      };
      const paramNamesString1 = Object.keys(data1).join(", ");
      const paramValuesString1 = Object.values(data1)
        .map((value) =>
          typeof value === "string"
            ? `"${mysql.escape(value).slice(1, -1)}"`
            : `'${value}'`
        )
        .join(", ");

      const callProcedureSQL1 = `CALL InsertQuizResult(?, ?, @inserted_id_result)`;
      await pool.execute(callProcedureSQL1, [
        paramNamesString1,
        paramValuesString1,
      ]);
      res.status(201).json({ message: "Submitted Successfully." });
    } else {
      res.status(201).json({ message: "Next Question." });
    }
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

module.exports = router;
