// This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
// Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
// session persistence, api calls, and more.
const Alexa = require('ask-sdk-core');
const fetch = require("node-fetch");
// const Products = require("./products");
const config = require("../config");

//jdbc:mariadb://www.reb0.org:3306
//Url: https://www.reb0.org/phpmyadmin
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


const EMOTION_HAPPY = "happy";
const EMOTION_NEUTRAL = 'neutral';
const EMOTION_SAD = 'sad';
const EMOTION_ANGRY = 'angry';
const EMOTION_FEARFUL = 'fearful';
const EMOTION_DISGUSTED = 'disgusted';
const EMOTION_SURPRISED = 'surprised';

async function getPrice(search) {
    let product = await getProduct(search);
    console.log(search);
    console.log(product);
    if (product) {
        //return 'It costs ' + product.price + ' €. ' + "Do you want to buy it?";
        return 'It costs ' + product.price + ' €. ';
    } else {
        return false;
    }
}

async function getProduct(search) {
    const sql = `SELECT * FROM product WHERE LOWER(name) LIKE '${search}' LIMIT 1`;
    return (await query(sql))[0];

    // for (let key in Products) {
    //     let product = Products[key];
    //     // console.log(product);
    //     // for(let prop in product) {
    //     //     res = res + prop + ';';
    //     // }
    //     if (product.hasOwnProperty('name')) {
    //         // res = res + product.name + ';';
    //         if (product.name.toLowerCase() === search) {
    //             return product.price;
    //         }
    //     }
    // }
    // return false;
}

async function getProductsWithCategoryAndEmotion(category, emotion) {
    const sql = `SELECT p.name, p.product_ID, p.brand, p.price, p.quantity, p.energy, p.weight, p.emotion, p.smallImageUrl, p.largeImageUrl, p.state
FROM product p
JOIN product_category pc ON p.product_ID = pc.productID 
JOIN category c ON pc.categoryID = c.categoryID
WHERE c.name = '${category}' AND p.emotion = '${emotion}'`; //TODO: SQL Abfrage für Emotion anpassen
    return await query(sql);
}

async function getProductsWithCategory(category) {
    const sql = `SELECT p.name, p.product_ID, p.brand, p.price, p.quantity, p.energy, p.weight, p.emotion, p.smallImageUrl, p.largeImageUrl, p.state
FROM product p
JOIN product_category pc ON p.product_ID = pc.productID 
JOIN category c ON pc.categoryID = c.categoryID
WHERE c.name = '${category}'`;
    return await query(sql);

    // let productList = [];
    //let productList = type;
    /*switch (type){
       case 1: type = 'food';
       case 2: type = 'drink';
   }  */

    // for (var key in Products) {
    //     let product = Products[key];
    //     if (product.categories[0] === category) {
    //         //productList = product.name;
    //         productList.push(product.name);
    //     }
    // }
    // return productList;
}

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    async handle(handlerInput) {
        let speakOutput = 'Welcome to our vending machine!';
        const emotion = await getEmotion();
        if (emotion == EMOTION_HAPPY) {
            speakOutput += ' Looks like you are very ' + emotion + ' today!';
        } else if (emotion == EMOTION_ANGRY) {
            speakOutput += ' I think your\'re angry! Tell me about your secrets!';
        } else if (emotion == EMOTION_SAD) {
            speakOutput += ' I think your\'re sad! How can I cheer you up?';
        } else if (emotion == EMOTION_SURPRISED) {
            speakOutput += ' Why are you suprised? What happend?';
        }
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .withSimpleCard("Welcome to our vending machine!", "You can say \"I am hungry\" or choose a specific product. For advice you can say \"I want to buy something\".")
            .getResponse();
    }
};

async function getEmotion() {
    try {
        const expressions = await postData('http://localhost:3002/api/vending/load', {
            'vendingId': 0,
            'prop': 'expressions'
        });
        let max = 0;
        let expressionMax = 'undefined';

        for (let expression in expressions) {
            let val = expressions[expression];
            if (val > max) {
                max = val;
                expressionMax = expression;
            }
        }

        return expressionMax;
    } catch (e) {
        throw "Maybe you haven't turned on the face detection server." + e;
    }

    return 'neutral';
}

async function setMode(mode = {'trainProfile': true}) {
    try {
        return Boolean(await postData('http://localhost:3002/api/vending/save', mode));
    } catch (e) {
        throw "Maybe you haven't turned on the face detection server. " + e;
    }
}

async function postData(url = '', data = {}) {
    // Default options are marked with *
    const response = await fetch(url, {
        method: 'POST', // *GET, POST, PUT, DELETE, etc.
        mode: 'cors', // no-cors, *cors, same-origin
        cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
        credentials: 'same-origin', // include, *same-origin, omit
        headers: {
            'Content-Type': 'application/json'
            // 'Content-Type': 'application/x-www-form-urlencoded',
        },
        redirect: 'follow', // manual, *follow, error
        referrer: 'no-referrer', // no-referrer, *client
        body: JSON.stringify(data) // body data type must match "Content-Type" header
    });
    const contentType = response.headers.get("content-type");
    if (response.status >= 400)
        throw response.status + ' (' + response.statusText + ')';
    if (contentType && contentType.indexOf("application/json") !== -1) {
        return await response.json() // parses JSON response into native JavaScript objects
    }
    if(response.status === 204)
        return false;
    return response;
}

const WantToBuySomethingIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'AdviceIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'We offer drinks and snacks. Are you hungry or thirsty?';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .withSimpleCard("ttest.", "just a test.")
            .getResponse();
    }
};


const BuyIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'BuyIntent' &&
            handlerInput.requestEnvelope.request.intent.slots.product;
    },
    async handle(handlerInput) {
        // TODO allow every product in db
        const intent = handlerInput.requestEnvelope.request.intent;
        let productName = handlerInput.requestEnvelope.request.intent.slots.product.value;
        let product = await getProduct(productName);
        let responseBuilder = handlerInput.responseBuilder;
        let speakOutput;
        if (product) {
            speakOutput = 'It costs ' + product.price + ' €. ';
            responseBuilder = responseBuilder.addDelegateDirective({
                name: 'consent',
                confirmationStatus: 'NONE',
                slots: {}
            });
        } else {
            speakOutput = "Sorry, we don't sell this product.";
        }

        if (product.largeImageUrl) {
            // console.log(product.largeImageUrl);
            responseBuilder = responseBuilder.withStandardCard(
                product.name,
                'Price: ' + product.price +
                "\nBrand: " + product.brand,
                null,
                product.largeImageUrl
            );
            // cards are not updated:
            // https://stackoverflow.com/questions/53269516/alexa-not-showing-card-despite-being-present-in-json

            // responseBuilder = responseBuilder
            //     .reprompt(speakOutput)
            //     .withSimpleCard(
            //     product.name,
            //     'Price: ' + product.price
            //     + "\nBrand: " + product.brand
            // );
        }

        responseBuilder = responseBuilder.speak(speakOutput);

        return responseBuilder.getResponse();
    }
};

const CategoryOfDecisionIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'category_of_decision';
    },
    async handle(handlerInput) {
        //let aisystem = handlerInput.requestEnvelope.request.intent.slots.category_of_product.value;
        let slotName = handlerInput.requestEnvelope.request.intent.slots.category_of_product.resolutions.resolutionsPerAuthority[0].values[0].value.name;
        /*if (aisystem === 1) var prodType = 'snacks';
         if (aisystem === 2) prodType = "drinks";*/
        const products = await getProductsWithCategory(slotName);
        const emotion = await getEmotion();
        const productsWithEmotions = await getProductsWithCategoryAndEmotion(slotName, emotion);

        // Extract product name, implode the array, and replace & with and, as alexa doesn't understand &.
        const productsStr = products.map(product => product.name).join(', ').replace('&', ' and ');
        const productsWithEmotionsStr = productsWithEmotions.map(product => product.name).join(', ').replace('&', ' and ');
        let speakOutput = '';
        if (emotion != EMOTION_NEUTRAL) {
            speakOutput += 'You look ' + emotion + '. ';
            speakOutput += `I think you need this: ` + productsWithEmotionsStr;
            speakOutput += `. Additionally, we offer the following ${slotName}: ` + productsStr + ". Which do you choose?";
        } else {
            speakOutput += `We offer the following ${slotName}: ` + productsStr + ". Which do you choose?";
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .withSimpleCard(`We offer the following ${slotName}: `, productsStr)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

const RecordFaceHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'record_face';
    },
    async handle(handlerInput) {
        let slotName = handlerInput.requestEnvelope.request.intent.slots.name.value;
        let success = false;
        let errorMessage;
        if (slotName) {
            try {
                success = await setMode({'trainProfile': slotName});
            } catch (e) {
                errorMessage = e;
            }
        }
        console.log(slotName);
        let speakOutput = success ? "I saved your profile, " + slotName + '.' :
            "I'm sorry, your profile couldn't be saved. " + errorMessage + ". Try again!";

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const HowMuchIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'CostsIntent';
    },
    async handle(handlerInput) {
        let slotName = handlerInput.requestEnvelope.request.intent.slots.product.value;
        let speakOutput = await getPrice(slotName);

        if (!speakOutput) {
            speakOutput = "Sorry, we don't sell this product. ";
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const ConsentIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'consent';
    },
    handle(handlerInput) {

        speakOutput = "No confirmation";

        var confirm = handlerInput.requestEnvelope.request.intent.confirmationStatus;
        console.log(confirm);

        if (handlerInput.requestEnvelope.request.intent.confirmationStatus === 'DENIED')
            speakOutput = "It's a pity! Then choose something else";
        if (handlerInput.requestEnvelope.request.intent.confirmationStatus === 'CONFIRMED')
            speakOutput = 'You bought it. Bon appetit!';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const StopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'StopIntent';
    },
    handle(handlerInput) {

        if (handlerInput.requestEnvelope.request.intent.confirmationStatus === 'DENIED')
            speakOutput = "Then thank you for your purchase! Come back!";
        if (handlerInput.requestEnvelope.request.intent.confirmationStatus === 'CONFIRMED')
            speakOutput = "Okay, I return your money";

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'You can say hello to me! How can I help?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent' ||
                Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Goodbye!';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse();
    }
};

// The intent reflector is used for interaction model testing and debugging.
// It will simply repeat the intent the user said. You can create custom handlers
// for your intents by defining them above, then also adding them to the request
// handler chain below.
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

// Generic error handling to capture any syntax or routing errors. If you receive an error
// stating the request handler chain is not found, you have not implemented a handler for
// the intent being invoked or included it in the skill builder below.
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`~~~~ Error handled: ${error.stack}`);
        const speakOutput = `Sorry, I had trouble doing what you asked. Please try again.` + error;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

// The SkillBuilder acts as the entry point for your skill, routing all request and response
// payloads to the handlers above. Make sure any new handlers or interceptors you've
// defined are included below. The order matters - they're processed top to bottom.
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        BuyIntentHandler,
        WantToBuySomethingIntentHandler,
        CategoryOfDecisionIntentHandler,
        HowMuchIntentHandler,
        ConsentIntentHandler,
        StopIntentHandler,
        HelpIntentHandler,
        RecordFaceHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler, // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
    )
    .addErrorHandlers(
        ErrorHandler,
    )
    .lambda();