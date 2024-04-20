/**
 * @fileoverview This module sets up administrative routes for managing and monitoring server nodes
 * within the network. It provides functionality to create, delete, and debug nodes, as well as check
 * their current status. User authentication and admin role verification are enforced for access to
 * these routes.
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { db } = require('../handlers/db.js');

/**
 * Middleware to verify if the user is an administrator.
 * Checks if the user object exists and if the user has admin privileges. If not, redirects to the
 * home page. If the user is an admin, proceeds to the next middleware or route handler.
 *
 * @param {Object} req - The request object, containing user data.
 * @param {Object} res - The response object.
 * @param {Function} next - The next middleware or route handler to be executed.
 * @returns {void} Either redirects or proceeds by calling next().
 */
function isAdmin(req, res, next) {
  if (!req.user || req.user.admin !== true) {
    return res.redirect('../');
  }
  next();
}

/**
 * Checks the operational status of a node by making an HTTP request to its API.
 * Updates the node's status based on the response or sets it as 'Offline' if the request fails.
 * This status check and update are persisted in the database.
 *
 * @param {Object} node - The node object containing details such as address, port, and API key.
 * @returns {Promise<Object>} Returns the updated node object after attempting to verify its status.
 */
async function checkNodeStatus(node) {
  try {
    const RequestData = {
      method: 'get',
      url: 'http://' + node.address + ':' + node.port + '/',
      auth: {
        username: 'Skyport',
        password: node.apiKey
      },
      headers: { 
        'Content-Type': 'application/json'
      }
    };
    const response = await axios(RequestData);
    const { versionFamily, versionRelease, online, remote, docker } = response.data;

    node.status = 'Online';
    node.versionFamily = versionFamily;
    node.versionRelease = versionRelease;
    node.remote = remote;
    node.docker = docker;

    await db.set(node.id + '_node', node); // Update node info with new details
    return node;
  } catch (error) {
    node.status = 'Offline';
    await db.set(node.id + '_node', node); // Update node as offline if there's an error
    return node;
  }
}

/**
 * GET /nodes/debug
 * Asynchronously retrieves and updates the status of all nodes registered in the database.
 * Available only to administrators. The status of each node is checked and updated through a
 * specific function call which queries the node's API.
 *
 * @returns {Response} Returns a JSON array of all nodes with their updated statuses.
 */
router.get('/nodes/debug', isAdmin, async (req, res) => {
  const nodeIds = await db.get('nodes') || [];
  const nodes = await Promise.all(nodeIds.map(id => db.get(id + '_node').then(checkNodeStatus)));
  res.json(nodes);
});

/**
 * GET /account/debug
 * Provides debug information about the currently logged-in user. Available only to administrators.
 * Ensures that user data is available in the request object, then returns this data in JSON format.
 *
 * @returns {Response} Returns a JSON object containing user details if available; otherwise, sends a debug error message.
 */
router.get('/account/debug', isAdmin, async (req, res) => {
  if (!req.user) res.send('no req.user present!')
  res.json(req.user);
});

/**
 * POST /nodes/create
 * Creates a new node with specified parameters from the request body, such as name, hardware specifications,
 * and API credentials. After creation, the node's operational status is checked and updated. The new node is
 * then saved in the database. This route is secured and available only to administrators.
 *
 * @returns {Response} Sends the newly created and status-updated node data.
 */
router.post('/nodes/create', isAdmin, async (req, res) => {
  const node = {
    id: uuidv4(),
    name: req.body.name,
    tags: req.body.tags,
    ram: req.body.ram,
    disk: req.body.disk,
    processor: req.body.processor,
    address: req.body.address,
    port: req.body.port,
    apiKey: req.body.apiKey,
    status: 'Unknown' // Default status
  };

  await db.set(node.id + '_node', node); // Save the initial node info
  const updatedNode = await checkNodeStatus(node); // Check and update status

  const nodes = await db.get('nodes') || [];
  nodes.push(node.id);
  await db.set('nodes', nodes);

  res.status(201).send(updatedNode);
});

/**
 * DELETE /nodes/delete
 * Deletes a node from the database based on its identifier provided in the request body. Updates the list of
 * all nodes in the database to reflect this deletion. This operation is restricted to administrators.
 *
 * @returns {Response} Sends a status response indicating the successful deletion of the node.
 */
router.delete('/nodes/delete', isAdmin, async (req, res) => {
  const nodeId = req.body.nodeId;
  const nodes = await db.get('nodes') || [];
  const newNodes = nodes.filter(id => id !== nodeId);

  await db.set('nodes', newNodes);
  await db.delete(nodeId + '_node');

  res.status(204).send();
});

/**
 * GET /admin/nodes
 * Retrieves a list of all nodes, checks their statuses, and renders an admin page to display these nodes.
 * This route is protected and allows only administrators to view the node management page.
 *
 * @returns {Response} Renders the 'nodes' view with node data and user information.
 */
router.get('/admin/nodes', isAdmin, async (req, res) => {
  let nodes = await db.get('nodes') || [];
  nodes = await Promise.all(nodes.map(id => db.get(id + '_node').then(checkNodeStatus)));

  res.render('nodes', { user: req.user, nodes, name: await db.get('name') || 'Skyport' });
});

module.exports = router;
