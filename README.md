## Local Alexa Skill

Insert `config.json` in root folder.

Insert `asl-config.json` in root folder:
```
{
  "skillId" : "amzn1.ask.skill.your_skill_id",
  "stage" : "development"
}
```

Follow instructions on :
https://www.npmjs.com/package/alexa-skill-local

```
$ npm install
$ npm install -g alexa-skill-local
```

Start local alexa lambda with `npm start` or `alexa-skill-local`.

Open second terminal and start face detection sever with `npm start --prefix face`.