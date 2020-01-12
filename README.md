## Local Alexa Skill

### Setup

Insert `config.json` in root folder.
Insert `asl-config.json` in `/alexa` folder:
```
{
  "skillId" : "amzn1.ask.skill.your_skill_id",
  "stage" : "development"
}
```

Follow instructions on :
https://www.npmjs.com/package/alexa-skill-local

```
$ cd alexa
$ npm install
$ npm install -g alexa-skill-local
```
### Start

In terminal go to folder via `cd alexa`.
Start local alexa lambda with `npm start` or `alexa-skill-local`.
Use alexa skill interface to try out: _https://developer.amazon.com/alexa/console/ask_.

## Face analytics

### Setup
Install packages via 

```
cd face
npm install
```

### Start

Open **second** terminal and go to folder `/face` via `cd face`.
Start face detection sever with `npm start`.
Open  `http://localhost:3002` on Chrome.