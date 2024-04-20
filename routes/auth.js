/**
 * @fileoverview This module sets up the authentication routes using Passport for user
 * authentication with a local strategy. It handles user login, logout, and registration processes.
 * User credentials are verified against a custom database handler, and sessions are managed
 * through Passport's session handling.
 */

const express = require('express');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const { db } = require('../handlers/db.js');
const { v4: uuidv4 } = require('uuid');  // Import the uuid function

const router = express.Router();

// Initialize passport
router.use(passport.initialize());
router.use(passport.session());

/**
 * Configures Passport's local strategy for user authentication. It checks the provided
 * username and password against stored credentials in the database. If the credentials
 * match, the user is authenticated; otherwise, appropriate error messages are returned.
 *
 * @returns {void} No return value but configures the local authentication strategy.
 */
passport.use(new LocalStrategy(
  async (username, password, done) => {
    try {
      const user = await db.get(username);
      if (!user) {
        return done(null, false, { message: 'Incorrect username.' });
      }
      if (user.password !== password) {
        return done(null, false, { message: 'Incorrect password.' });
      }
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

/**
 * Serializes the user to the session, storing only the username to manage login sessions.
 * @param {Object} user - The user object from the database.
 * @param {Function} done - A callback function to call with the username.
 */
passport.serializeUser((user, done) => {
  done(null, user.username);
});

/**
 * Deserializes the user from the session by retrieving the full user details from the database
 * using the stored username. Necessary for loading user details on subsequent requests after login.
 * @param {string} username - The username stored in the session.
 * @param {Function} done - A callback function to call with the user object or errors if any.
 */
passport.deserializeUser(async (username, done) => {
  try {
    const user = await db.get(username);
    if (!user) {
      throw new Error('User not found');
    }
    done(null, user);
  } catch (error) {
    done(error);
  }
});

/**
 * GET /auth/register
 * Handles user registration by taking a username and password from the query string, generating
 * a unique user ID, and saving these details to the database. On successful registration, the user
 * is redirected to the login page, otherwise, they are redirected back to the registration page.
 *
 * @returns {Response} Redirects to either the login page or the registration page based on the outcome.
 */
router.get('/auth/register', async (req, res) => {
  const { username, password } = req.query;
  const userId = uuidv4();  // Generate a unique user ID
  try {
      // Store the user with the newly generated ID
      await db.set(username, { userId, username, password, admin: true });
      res.redirect('/login');
  } catch (error) {
      res.redirect('/register');
  }
});

/**
 * GET /auth/login
 * Authenticates a user using Passport's local strategy. If authentication is successful, the user
 * is redirected to the instances page, otherwise, they are sent back to the login page with an error.
 *
 * @returns {Response} Redirects based on the success or failure of the authentication attempt.
 */
router.get('/auth/login', passport.authenticate('local', {
    successRedirect: '/instances',
    failureRedirect: '/login?err=InvalidCredentials&state=failed'
}));

/**
 * GET /auth/logout
 * Logs out the user by ending the session and then redirects the user.
 *
 * @returns {Response} No specific return value but ends the user's session and redirects.
 */
router.get('/auth/logout', (req, res) => {
    req.logout();
});

module.exports = router;