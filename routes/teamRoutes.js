require("dotenv").config();
const express = require("express");
const router = express.Router();
const pool = require("../config/database");
const mysql = require("mysql");
const uniqid = require("uniqid");
const {
  dateConversion,
  transporter,
  convertObjectToProcedureParams,
} = require("../utils");
const authMiddleware = require("../middleware/authMiddleware");

//Get Team Details By teamId
router.get(
  "/api/team/team-details/:teamId",
  authMiddleware,
  async (req, res) => {
    try {
      const { teamId } = req.params;

      // Fetch team details
      const [team] = await pool.execute("CALL checkTeamByTeamId(?)", [teamId]);
      const teamRow = team[0][0];

      if (!teamRow) {
        return res.status(400).json({ message: "Invalid Team" });
      }

      // Fetch team members
      const [members] = await pool.execute("CALL checkTeamMemberByTeamId(?)", [
        teamId,
      ]);
      const membersRows = members[0];

      // if (membersRows.length > 0) {
      const membersWithUserData = await Promise.all(
        membersRows.map(async (item) => {
          const [user] = await pool.execute("CALL getDeveloperById(?)", [
            item.dev_id,
          ]);
          const userRow = user[0][0];
          return {
            memberData: item,
            userData: userRow,
          };
        })
      );

      return res.status(200).json({ teamRow, membersWithUserData });
      // } else {
      //   return res.status(400).json({ message: "No Results" });
      // }
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ error: "Internal Server Error", details: error.message });
    }
  }
);

//Create Team
router.post("/api/team/create-team", authMiddleware, async (req, res) => {
  try {
    const { userId, teamName, ipAddress, url, teamType } = req.body;
    const formattedDate = dateConversion();
    const randomCode = `${userId}${uniqid()}`;
    const randomName = teamName.replace(/ /g, "-");
    let teamLink = "";
    if (teamType == "individual") {
      teamLink = `${url}join-individual/${randomName}/${randomCode}`;
    } else if (teamType == "team") {
      teamLink = `${url}join-team/${randomName}/${randomCode}`;
    } else {
      teamLink = "";
    }

    const data = {
      team_creator_id: userId,
      team_name: teamName,
      team_code: randomCode,
      team_link: teamLink,
      team_type: teamType,
      team_ip_address: ipAddress,
      team_created_date: formattedDate,
    };

    const paramNamesString = Object.keys(data).join(", ");
    const paramValuesString = Object.values(data)
      .map((value) =>
        typeof value === "string"
          ? `"${mysql.escape(value).slice(1, -1)}"`
          : `'${value}'`
      )
      .join(", ");

    const callProcedureSQL = `CALL InsertTeam(?, ?, @inserted_id_result)`;
    await pool.execute(callProcedureSQL, [paramNamesString, paramValuesString]);

    const [insertedIdResult] = await pool.execute(
      "SELECT @inserted_id_result AS inserted_id"
    );

    const inserted_id = insertedIdResult[0]?.inserted_id;

    if (teamType == "team") {
      const [user] = await pool.execute("CALL getDeveloperById(?)", [userId]);
      const developerRow = user[0][0];
      const mailOptions = {
        from: `"BOB Hackathon" <${process.env.SMTP_FROM}>`,
        to: developerRow?.email_address,
        subject: "Team Created | BOB Hackathon",
        html: `<p><b>Congratulations on creating a new team! <br>
        This hackathon let's you have upto 4 teammates. </b>
        Share the below code with your teammates to join this hackathon. 
        Or Share the unique referral link to add teammates !</p><br>
        <p>Team Name: <b>${teamName}</b></p><br>
        <p>Code: <b>${randomCode}</b></p><br>
        <p>Unique Link: <b>${teamLink}</b></p>`, // HTML body
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          return console.log(error);
        }
        console.log("Message sent: %s", info.messageId);
      });
    }

    res
      .status(201)
      .json({ teamId: inserted_id, message: "Team Created Successfully." });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

//Join Team through Code/Link
router.post("/api/team/join-team", authMiddleware, async (req, res) => {
  try {
    console.log("req.body--->", req.body);
    const { module, dataObject, userId } = req.body;

    const formattedDate = dateConversion();

    let teamRow;

    if (module === "code") {
      const { code } = dataObject;
      const [team] = await pool.execute("CALL checkTeamByCode(?)", [code]);
      teamRow = team[0][0];
    } else if (module === "link") {
      const { link } = dataObject;
      const [team] = await pool.execute("CALL checkTeamByLink(?)", [link]);
      teamRow = team[0][0];
    } else {
      return res.status(400).json({ message: "Invalid module type" });
    }

    if (!teamRow) {
      return res
        .status(400)
        .json({ message: module === "code" ? "Invalid Code" : "Invalid Link" });
    }

    const teamId = teamRow.team_id;
    const teamOwner = teamRow.team_creator_id;

    if (teamRow.team_type == "individual" && teamOwner !== userId) {
      return res
        .status(400)
        .json({ message: module === "code" ? "Invalid Code" : "Invalid Link" });
    }

    if (teamOwner === userId) {
      return res.status(201).json({ message: "Team Joined Successfully." });
    }
    const [teamMember] = await pool.execute(
      "CALL checkTeamMemberByUserId(?,?)",
      [teamId, userId]
    );
    const teamMemberRow = teamMember[0];

    if (teamMemberRow.length > 0) {
      return res.status(201).json({ message: "Team Joined Successfully." });
    }

    const [members] = await pool.execute("CALL checkTeamMemberByTeamId(?)", [
      teamId,
    ]);
    const membersRows = members[0];

    if (membersRows.length >= 3) {
      return res.status(400).json({ message: "Only 4 members are allowed" });
    }

    const data = {
      team_id: teamRow.team_id,
      dev_id: userId,
      team_member_join_date: formattedDate,
    };
    const paramNamesString = Object.keys(data).join(", ");
    const paramValuesString = Object.values(data)
      .map((value) =>
        typeof value === "string"
          ? `"${mysql.escape(value).slice(1, -1)}"`
          : `'${value}'`
      )
      .join(", ");

    const callProcedureSQL = `CALL InsertTeamMembers(?, ?, @inserted_id_result)`;
    await pool.execute(callProcedureSQL, [paramNamesString, paramValuesString]);

    const [user] = await pool.execute("CALL getDeveloperById(?)", [userId]);
    const developerRow = user[0][0];
    const mailOptions = {
      from: `"BOB Hackathon" <${process.env.SMTP_FROM}>`,
      to: developerRow?.email_address,
      subject: "Joined the Team | BOB Hackathon",
      html: `<p><b>You have joined team ${teamRow.team_name}. <br>
        Below code or unique referral link is to join this hackathon.</p><br>
        <p>Code: <b>${teamRow.team_code}</b></p><br>
        <p>Unique Link: <b>${teamRow.team_link}</b></p>`, // HTML body
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return console.log(error);
      }
      console.log("Message sent: %s", info.messageId);
    });

    res
      .status(201)
      .json({ teamId: teamRow?.team_id, message: "Team Joined Successfully." });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

//Remove Member
router.delete("/api/team/remove-member", authMiddleware, async (req, res) => {
  try {
    const { removeById, userId, teamId } = req.body;
    const formattedDate = dateConversion();
    const [team] = await pool.execute("CALL checkTeamByTeamId(?)", [teamId]);
    const teamRow = team[0][0];
    if (!teamRow) {
      return res.status(400).json({ message: "Invalid Team Link" });
    }
    const teamOwner = teamRow.team_creator_id;

    let flag = "false";
    let ownerId = 0;
    let historyReason = "";
    let successMessage = "";

    if (removeById === teamOwner) {
      if (userId === teamOwner) {
        // Owner Himself
        const [members] = await pool.execute(
          "CALL checkTeamMemberByTeamId(?)",
          [teamId]
        );
        const membersRows = members[0][0];
        if (membersRows) {
          const newOwner = membersRows.dev_id;
          const dynamicFieldsValues = `team_creator_id = '${newOwner}'`;
          const id = `team_id  = '${teamId}'`;
          await pool.execute("CALL UpdateTeam(?, ?)", [
            dynamicFieldsValues,
            id,
          ]);

          const del = `dev_id = '${newOwner}' AND team_id = '${teamId}'`;
          await pool.execute("CALL DeleteTeamMembers(?)", [del]);

          flag = "true";
          ownerId = newOwner;
          historyReason = "Owner removed himself from the team";
          successMessage = "You have Left the Team Successfully.";
        } else {
          const del = `team_id = '${teamId}'`;
          await pool.execute("CALL DeleteTeam(?)", [del]);

          flag = "true";
          ownerId = teamOwner;
          historyReason = "Owner deleted the team";
          successMessage = "Team Deleted Successfully.";
        }
      } else {
        const del = `dev_id = '${userId}' AND team_id = '${teamId}'`;
        await pool.execute("CALL DeleteTeamMembers(?)", [del]);

        flag = "true";
        ownerId = teamOwner;
        historyReason = "Owner removed the member from the team";
        successMessage = "Member Removed Successfully.";
      }
    } else {
      if (removeById === userId) {
        const del = `dev_id = '${userId}' AND team_id = '${teamId}'`;
        await pool.execute("CALL DeleteTeamMembers(?)", [del]);

        flag = "true";
        ownerId = teamOwner;
        historyReason = "Member removed himself from the team";
        successMessage = "You have Left the Team Successfully.";
      } else {
        flag = "false";
      }
    }

    if (flag === "true") {
      const history = {
        team_id: teamId,
        remove_by_id: removeById,
        user_id: userId,
        owner_id: ownerId,
        history_reason: historyReason,
        history_date: formattedDate,
      };

      const paramNamesString1 = Object.keys(history).join(", ");
      const paramValuesString1 = Object.values(history)
        .map((value) =>
          typeof value === "string"
            ? `"${mysql.escape(value).slice(1, -1)}"`
            : `'${value}'`
        )
        .join(", ");

      const callProcedureSQL1 = `CALL InsertTeamHistory(?, ?, @inserted_id_result)`;
      await pool.execute(callProcedureSQL1, [
        paramNamesString1,
        paramValuesString1,
      ]);
      res.status(201).json({ message: successMessage });
    } else {
      return res.status(400).json({ message: "Member Cannot be Removed" });
    }
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

//Invite Email Address
router.post(
  "/api/team/invite-email-address",
  authMiddleware,
  async (req, res) => {
    try {
      const { userId, email_address, teamId } = req.body;
      const formattedDate = dateConversion();
      const [team] = await pool.execute("CALL checkTeamByTeamId(?)", [teamId]);
      const teamRow = team[0][0];
      if (!teamRow) {
        return res.status(400).json({ message: "Invalid Team Link" });
      }

      const [members] = await pool.execute("CALL checkTeamMemberByTeamId(?)", [
        teamId,
      ]);
      const membersRows = members[0];

      if (membersRows.length >= 3) {
        return res.status(400).json({ message: "Only 4 members are allowed" });
      }

      const data = {
        team_id: teamRow.team_id,
        email_address: email_address,
        invited_by_id: userId,
        invited_date: formattedDate,
      };
      const paramNamesString = Object.keys(data).join(", ");
      const paramValuesString = Object.values(data)
        .map((value) =>
          typeof value === "string"
            ? `"${mysql.escape(value).slice(1, -1)}"`
            : `'${value}'`
        )
        .join(", ");

      const callProcedureSQL = `CALL InsertInvitedTeamMembers(?, ?, @inserted_id_result)`;
      await pool.execute(callProcedureSQL, [
        paramNamesString,
        paramValuesString,
      ]);

      const mailOptions = {
        from: `"BOB Hackathon" <${process.env.SMTP_FROM}>`,
        to: email_address,
        subject: "Invitation for Joining a Team | BOB Hackathon",
        html: `<p><b>You have been invited to join team ${teamRow.team_name} for the Hackathon. <br>
        Below code or unique referral link is to join this hackathon.</p><br>
        <p>Code: <b>${teamRow.team_code}</b></p><br>
        <p>Unique Link: <b>${teamRow.team_link}</b></p>`, // HTML body
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          return console.log(error);
        }
        console.log("Message sent: %s", info.messageId);
        res.status(201).json({ message: "Invited Successfully." });
      });
    } catch (error) {
      console.log(error);
      res
        .status(500)
        .json({ error: "Internal Server Error", details: error.message });
    }
  }
);

//get team
router.get("/api/team/get-team/:dev_id", authMiddleware, async (req, res) => {
  try {
    const { dev_id } = req.params;
    const [rows] = await pool.execute("CALL GetDeveloperTeamDetails(?)", [
      dev_id,
    ]);

    // Fetch team details
    const [team] = await pool.execute("CALL checkTeamByTeamId(?)", [
      rows[0][0].team_id,
    ]);
    const teamRow = team[0][0];

    // console.log("teamRow--->", teamRow);
    let membersArray = [];
    if (teamRow) {
      const [rows] = await pool.execute("CALL getDeveloperById(?)", [
        teamRow?.team_creator_id,
      ]);
      const creatorInfo = rows[0][0];

      // Fetch team members
      const [members] = await pool.execute("CALL checkTeamMemberByTeamId(?)", [
        teamRow?.team_id,
      ]);
      const membersRows = members[0];

      const membersInfo = membersRows?.map((member) => {
        return {
          id: member.dev_id,
          name: `${member.dev_first_name} ${member.dev_last_name}`,
          admin: false,
        };
      });

      const finalMembersArray = [
        {
          id: creatorInfo?.dev_id,
          name: `${creatorInfo.dev_first_name} ${creatorInfo.dev_last_name} (Admin)`,
          admin: true,
        },
        ...membersInfo,
      ];

      // console.log("finalMembersArray", finalMembersArray);
      membersArray?.push(...finalMembersArray);
    }

    res.status(200).json({ ...rows[0][0], teamMembers: membersArray });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
