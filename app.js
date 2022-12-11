const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const cookieParser = require("cookie-parser");
const csrf = require("tiny-csrf");

const passport = require("passport");
const LocalStrategy = require("passport-local");
const connectEnsureLogin = require("connect-ensure-login");
const session = require("express-session");
const bcrypt = require("bcrypt");

const saltRounds = 10;

const { Todo } = require("./models");
const { User } = require("./models");

const app = express();
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: false }));
app.set("view engine", "ejs");
// eslint-disable-next-line no-undef
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser("Some secret info"));
app.use(csrf("UicgFjabMtvsSJEHUSfK3Dz0NR6K0pIm", ["DELETE", "PUT", "POST"]));

app.use(
  session({
    secret: "SuperSecrectInformation",
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
    },
    resave: true,
    saveUninitialized: true,
  })
);

app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    async (email, password, done) => {
      // try {
      //   const user = await User.findOne({ where: { email: email } })
      //   if (!user) {
      //     return done(null, false, { message: 'Incorrect email.' });
      //   }
      //   if (!user.validPassword(password)) {
      //     return done(null, false, { message: 'Incorrect password.' });
      //   }
      //   return done(null, user);
      // } catch (error) {
      //   return done(error);
      // }
      User.findOne({ where: { email: email } })
        .then(async (user) => {
          const result = await bcrypt.compare(password, user.password);
          if (result) {
            return done(null, user);
          } else {
            return done("Invalid Password");
          }
        })
        .catch((error) => {
          return error;
        });
    }
  )
);

passport.serializeUser((user, done) => {
  console.log("Serializing User in session", user.id);
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  console.log("Deserializing User from session", id);
  User.findByPk(id)
    .then((user) => {
      done(null, user);
    })
    .catch((error) => {
      done(error, null);
    });
});

app.get("/", async function (request, response) {
  response.render("index", {
    title: "Todo Application",
    csrfToken: request.csrfToken(),
  });
});

app.get(
  "/todos",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const loggedInUser = request.user.id;
    const overDue = await Todo.overDue(loggedInUser);
    const dueToday = await Todo.dueToday(loggedInUser);
    const dueLater = await Todo.dueLater(loggedInUser);
    const completedItems = await Todo.completedItems(loggedInUser);
    if (request.accepts("html")) {
      response.render("todos", {
        title: "Todo Application",
        overDue: overDue,
        dueToday: dueToday,
        dueLater: dueLater,
        completedItems: completedItems,
        csrfToken: request.csrfToken(),
      });
    } else {
      response.json({
        overDue,
        dueToday,
        dueLater,
        completedItems,
      });
    }
  }
);

app.get(
  "/todos/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async function (request, response) {
    try {
      const todo = await Todo.findByPk(request.params.id);
      return response.json(todo);
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);

app.post("/todos", async function (request, response) {
  try {
    await Todo.addTodo({
      title: request.body.title,
      dueDate: request.body.dueDate,
      userId: request.user.id,
    });
    return response.redirect("/todos");
  } catch (error) {
    console.log(error);
    return response.status(422).json(error);
  }
});

app.put(
  "/todos/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async function (request, response) {
    const todo = await Todo.findByPk(request.params.id);
    try {
      const updatedTodo = await todo.toggleCompleted();
      return response.json(updatedTodo);
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);

app.delete(
  "/todos/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async function (request, response) {
    console.log("We have to delete a Todo with ID: ", request.params.id);
    const todo = await Todo.findByPk(request.params.id);
    const loggedInUser = request.user.id;
    try {
      if (todo) {
        await Todo.remove(todo.id, loggedInUser);
        return response.json({
          success: true,
        });
      } else {
        return response.status(404);
      }
    } catch (error) {
      return response.status(422).json({
        success: false,
      });
    }
  }
);

app.get("/signup", (request, response) => {
  response.render("signup", {
    title: "Sign Up",
    csrfToken: request.csrfToken(),
  });
});

app.post("/users", async (request, response) => {
  const hashedPassword = await bcrypt.hash(request.body.password, saltRounds);
  // console.log(hashedPassword)
  try {
    const user = await User.create({
      firstName: request.body.firstName,
      lastName: request.body.lastName,
      email: request.body.email,
      password: hashedPassword,
    });
    request.login(user, (error) => {
      if (error) {
        console.log(error);
        response.status(422).json(error);
      }
      response.redirect("/todos");
    });
  } catch (error) {
    console.log(error);
    response.status(422).json(error);
  }
});

app.get("/login", (request, response) => {
  response.render("signin", {
    title: "Sign In",
    csrfToken: request.csrfToken(),
  });
});

app.post(
  "/session",
  passport.authenticate("local", { failureRedirect: "/login" }),
  (request, response) => {
    response.redirect("/todos");
  }
);

app.get("/signout", (request, response, next) => {
  request.logout((err) => {
    if (err) {
      next(err);
    }
    response.redirect("/");
  });
});

module.exports = app;
