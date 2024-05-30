require("dotenv").config();
const express = require("express");
const router = express.Router();
const pool = require("../config/database");
const { isEmail } = require("validator");
const { generateToken } = require("../utils/auth");
const { capitalizeEachWord } = require("../utils");
require("../utils");

//Get All Quiz
router.get("/api/quiz/all-quiz", async (req, res) => {
  try {
    const [quiz] = await pool.execute("CALL getAllQuiz()");
    const quizResult = quiz[0];
    res.status(201).json({ quizList: quizResult });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

//Get Top 15 Quiz Result
router.get("/api/quiz/top-15-quiz-results", async (req, res) => {
  try {
    const [quiz] = await pool.execute("CALL top15QuizResults()");
    const quizResults = quiz[0];
    let resultsWithUserData = [];
    if (quizResults.length > 0) {
      resultsWithUserData = await Promise.all(
        quizResults.map(async (item) => {
          return {
            dev_id: item.dev_id,
            full_name: `${item.dev_first_name} ${item.dev_last_name}`,
            total_questions: item.total_questions,
            less_time: item.less_time,
            result_date: item.result_date,
          };
        })
      );

      res.status(201).json({ resultData: resultsWithUserData });
    } else {
      res.status(201).json({ resultData: resultsWithUserData });
    }
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

//Get All Quiz Result
router.get("/api/quiz/quiz-results/:cond", async (req, res) => {
  try {
    const { cond } = req.params;
    let [quiz] = await pool.execute("CALL top15QuizResults()");
    if (cond == "all") {
      [quiz] = await pool.execute("CALL topAllQuizResults()");
    } else if (cond == "today") {
      [quiz] = await pool.execute("CALL topTodayQuizResults()");
    } else {
      [quiz] = await pool.execute("CALL top15QuizResults()");
    }
    const quizResults = quiz[0];
    let resultsWithUserData = [];
    if (quizResults.length > 0) {
      resultsWithUserData = await Promise.all(
        quizResults.map(async (item) => {
          return {
            dev_id: item.dev_id,
            full_name: `${item.dev_first_name} ${item.dev_last_name}`,
            total_questions: item.total_questions,
            less_time: item.less_time,
            result_date: item.result_date,
          };
        })
      );
      res.status(201).json({ resultData: resultsWithUserData });
    } else {
      res.status(201).json({ resultData: resultsWithUserData });
    }
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

//Get Developer Details
router.get("/api/developer/developer-detail/:devId", async (req, res) => {
  try {
    const { devId } = req.params;
    const [user] = await pool.execute("CALL getDeveloperById(?)", [devId]);
    const developerRow = user[0][0];

    const [quiz] = await pool.execute("CALL getDeveloperQuiz(?)", [devId]);
    const quizDone = quiz[0];

    const [quizResult] = await pool.execute("CALL getDeveloperQuizResult(?)", [
      devId,
    ]);
    const quizResults = quizResult[0];

    const [memberResult] = await pool.execute("CALL getDeveloperAsMember(?)", [
      devId,
    ]);
    const memberResults = memberResult[0];

    const [ownerResult] = await pool.execute("CALL getDeveloperAsOwner(?)", [
      devId,
    ]);
    const ownerResults = ownerResult[0];

    res.status(201).json({
      developerRow,
      quizDone,
      quizResults,
      memberResults,
      ownerResults,
    });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

//Get All Idea Submission
router.get("/api/idea/view-all-idea-submission", async (req, res) => {
  try {
    const [idea] = await pool.execute("CALL getIdeaSubmissions()");
    const ideaResult = idea[0];
    let resultsWithUserData = [];
    if (ideaResult.length > 0) {
      resultsWithUserData = await Promise.all(
        ideaResult.map(async (item) => {
          return {
            idea_id: item.idea_id,
            dev_id: item.dev_id,
            team_owner: capitalizeEachWord(
              `${item.dev_first_name} ${item.dev_last_name}`
            ),
            team_name: item.team_name,
            problem_statment: item.problem_statment,
            solution: item.solution,
            github_link: item.github_link,
            ppt_file_name: item.ppt_file_name,
            idea_status: capitalizeEachWord(item.idea_status),
            created_date: item.created_date,
          };
        })
      );
      res.status(200).json({ resultData: resultsWithUserData });
    } else {
      res.status(200).json({ resultData: resultsWithUserData });
    }
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

//ViewRegisteredDevelopers
router.get("/api/common/view-registered-developers", async (req, res) => {
  try {
    const [RegisteredDevelopersResult] = await pool.execute(
      "CALL ViewRegisteredDevelopers()"
    );

    const RegisteredDevelopersList = RegisteredDevelopersResult[0];

    res.status(200).json({ RegisteredDevelopersList });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

//Get All Teams
router.get("/api/common/view-all-teams", async (req, res) => {
  try {
    const [teams] = await pool.execute("CALL allTeams()");
    const teamsResult = teams[0];

    let resultsWithUserData = [];
    if (teamsResult.length > 0) {
      resultsWithUserData = await Promise.all(
        teamsResult.map(async (item) => {
          const [teamMem] = await pool.execute("CALL allTeamMembersByTeam(?)", [
            item.team_id,
          ]);
          const teamMemResult = teamMem[0];
          let memberData = [];
          if (teamMemResult.length > 0) {
            memberData = await Promise.all(
              teamMemResult.map((it) => {
                return {
                  dev_id: it.dev_id,
                  team_member: `${it.dev_first_name} ${it.dev_last_name}`,
                  team_name: item.team_name,
                };
              })
            );
          }
          const [idea] = await pool.execute("CALL getTeamIdeaSubmission(?)", [
            item.team_id,
          ]);
          const ideaRow = idea[0][0];
          return {
            dev_id: item.dev_id,
            team_admin: `${item.dev_first_name} ${item.dev_last_name}`,
            team_name: item.team_name,
            team_link: item.team_link,
            team_members: memberData,
            ideas: ideaRow,
            team_created_date: item.team_created_date,
          };
        })
      );

      res.status(201).json({ resultData: resultsWithUserData });
    } else {
      res.status(201).json({ resultData: resultsWithUserData });
    }
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

module.exports = router;
