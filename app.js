require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const app = express();
const cors = require("cors");
const bodyParser = require("body-parser");

//--------------------------user panel-------------------------------//
const User = require("./routes/userRoutes");
const Team = require("./routes/teamRoutes");
const Quiz = require("./routes/quizRoutes");
const IdeaSubmission = require("./routes/ideaSubmissionRoutes");

//--------------------------superadmin panel-------------------------------//
const SuperAdmin = require("./superadmin-routes/superadminRoutes");

//--------------------------organizer panel-------------------------------//
const Organizer = require("./organizer-routes/organizerRoutes");
const OrganizerQuiz = require("./organizer-routes/quizRoutes");
const Events = require("./organizer-routes/eventsRoutes");
const Emails = require("./organizer-routes/emailRoutes");

//--------------------------mentor panel-------------------------------//
const Mentor = require("./mentor-routes/mentorRouter");
const MentorIdeaSubmission = require("./mentor-routes/ideaSubmissionRoutes");

//--------------------------logger-------------------------------//
const Logger = require("./logger-route/loggerRoute");

const Common = require("./common-routes/commonRoutes");

const PORT = process.env.PORT || 3000;
require("./config/database");
app.use(express.json({ limit: "100mb" }));
app.use(bodyParser.json({ limit: "500mb" }));
app.use(bodyParser.urlencoded({ limit: "500mb", extended: true }));

// Use Helmet!
app.use(helmet());

// Use cors

// Allowed origins
const allowedOrigins = ["http://localhost:5173"];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin, like mobile apps or curl requests
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true); // Origin allowed
    } else {
      callback(new Error("Not allowed by CORS")); // Origin not allowed
    }
  },
  // Additional CORS configuration if needed
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true, // Allow cookies to be sent with requests
};

app.use(cors(corsOptions));

//--------------------------user panel-------------------------------//
app.use(User);
app.use(Team);
app.use(Quiz);
app.use(IdeaSubmission);

//--------------------------superadmin panel-------------------------------//
app.use(SuperAdmin);

//--------------------------organizer panel-------------------------------//
app.use(Organizer);
app.use(OrganizerQuiz);
app.use(Events);
app.use(Emails);

//--------------------------mentor panel-------------------------------//
app.use(Mentor);
app.use(MentorIdeaSubmission);

//--------------------------logger-------------------------------//
app.use(Logger);

app.use(Common);

app.listen(PORT, () => console.log(`Server Started at PORT:${PORT}`));
