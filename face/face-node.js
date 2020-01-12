const express = require('express');
const fs = require('fs').promises;
const app = express();
const bodyParser = require('body-parser');

app.use(express.static('public'));
app.use('/scripts', express.static(__dirname + '/node_modules/'));
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies


// const hostname = '127.0.0.1';
const port = 3002;

app.listen(port, () => {
    console.log(`Server running at port: ${port}/`);
});

app.get('/', function(req, res){
    res.sendFile('index.html');
});

const config = require("../config");
const mariadb = require('mariadb');
const pool = mariadb.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database
});

/**
 * Query the mariadb database
 * @param sql
 * @returns {Promise<boolean|any>}
 */
async function query(sql, params = []) {
    let conn;
    try {
        conn = await pool.getConnection();
        return await conn.query(sql, params);
    } catch (err) {
        throw err;
    } finally {
        if (conn)
            await conn.end();
    }
    return false;
}

/**
 *
 */
app.post('/api/vending/save', async function(req, res) {
    if(req.body.hasOwnProperty('expressions')) {
        await saveVendingState(getVendingId(req), 'expressions', req.body.expressions);
    } else if(req.body.hasOwnProperty('trainProfile')) {
        await saveVendingState(getVendingId(req), 'trainProfile', req.body.trainProfile);
        // Wait for saved profile from client
        if (req.body.trainProfile) {
            // Wait until profile training is completed and send ok status.
            try {
                await checkFlag(async function () {
                    const trainProfile = await loadVendingState(getVendingId(req), 'trainProfile');
                    return !Boolean(trainProfile);
                }, function () {
                    res.sendStatus(200);
                }, 200, 10000, function () {
                    console.log("Timeout of face detection!");
                    res.sendStatus(599);
                });
            } catch (e) {
                res.sendStatus(500);
            }
            //await sleep(3000);
            return;
        }
    }
    res.sendStatus(200);
});

app.post('/api/vending/load', async function(req, res) {
    // const expressions = req.body.expressions;
    if(req.body.hasOwnProperty('prop')) {
        const data = await loadVendingState(getVendingId(req), req.body.prop);
        if(data) {
            await res.json(data);
        } else
            await res.sendStatus(204); // send no content
    }
});

app.post('/api/profiles/save', async function(req, res) {
    const newProfiles = req.body;

    // save to cache
    /* const profiles = await loadState('profiles') || {};
    for (let name in newProfiles) {
        if (newProfiles.hasOwnProperty(name)) {
            const profile = (profiles[name] || {});
            const newProfile = newProfiles[name];
            for (let prop in newProfile) {
                if (newProfile.hasOwnProperty(prop)) {
                    profile[prop] = newProfile[prop];
                }
            }
            profiles[name] = profile;
            //delete newProfiles[name];
        }
    }
    await saveState('profiles', profiles); */

    // save to database
    for (let name in newProfiles) {
        if (newProfiles.hasOwnProperty(name)) {
            const newProfile = newProfiles[name];

            await createOrUpdateUser(name, null, null, newProfile);
        }
    }

    await res.sendStatus(200);
});

async function getUser(name) {
    const sql = `SELECT * FROM user WHERE name=${name}`;
    return (await query(sql, [name]))[0];
}

async function getUsers() {
    const sql = `SELECT * FROM user`;
    return (await query(sql));
}

async function createOrUpdateUser(name, surname = null, age = null, faceData = null) { //you can push here any aruments that you need, such as name, surname, age...
    const sql = `REPLACE INTO user (name, surname, age, faceData) VALUES (?,?,?,?)`;
    return (await query(sql, [name, surname, age, faceData]));
}

app.post('/api/profiles/load', async function(req, res) {
    /*
    const profiles = await loadState('profiles') || {};
    if(req.body.hasOwnProperty('name')) {
        const name = req.body.name;
        const profile = (profiles[name] || {});
        await res.json(profile);
    } else {
        await res.json(profiles);
    }
    */
    const users = await getUsers();

    const profiles = {};
    users.forEach(user => {
        if(user.hasOwnProperty("name")
            && user.hasOwnProperty("faceData")
            && user.faceData) {
            profiles[user.name] = JSON.parse(user.faceData);
        }
    });
    await res.json(profiles);
});

async function checkFlag(flag, callback, time, max, onFail) {
    if(max < 1) {
        onFail();
    } else if((await flag()) === false) {
        setTimeout(function() {
            checkFlag(flag, callback, time, max - time, onFail);
        }, time);
    } else {
        callback();
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getVendingId(req){
    if(req.body.hasOwnProperty('vendingId')) {
        return req.body.vendingId;
    }
    return 0;
}

/**
 * Cache data for later use.
 *
 * @type {Object}
 */
const cache = {};

async function saveVendingState(vendingId, name, object){
    await saveState(vendingId + "-" + name, object);
}

async function loadVendingState(vendingId, name){
    return await loadState(vendingId + "-" + name);
}

async function saveState(name, object) {
    cache[name] = object;
    // await fs.writeFile(__dirname + `/tmp/state-${name}.json`, JSON.stringify(object));
}

async function loadState(name) {
    // const data = await fs.readFile(__dirname + `/tmp/state-${name}.json`);
    // return JSON.parse(data);
    return cache[name];
}