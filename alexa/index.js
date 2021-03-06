// This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
// Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
// session persistence, api calls, and more.
const Alexa = require('ask-sdk-core');
const fetch = require("node-fetch");
const moment = require("moment");
const TemporalSimilarity = require('./TemporalSimilarity.js');
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
    let product = await getProductByName(search);
    console.log(search);
    console.log(product);
    if (product) {
        //return 'It costs ' + product.price + ' €. ' + "Do you want to buy it?";
        return 'It costs ' + product.price + ' €. ';
    } else {
        return false;
    }
}

async function getProductByName(name) {
    const sql = `SELECT * FROM product WHERE LOWER(name) LIKE ? LIMIT 1`;
    return (await query(sql, [name]))[0];
}

async function getProductById(productId) {
    const sql = `SELECT * FROM product WHERE productID = ?`;
    return (await query(sql, [productId]))[0];
}

async function getUserByName(name) {
    const sql = `SELECT * FROM user WHERE LOWER(name) LIKE ? LIMIT 1`;
    return (await query(sql, [name]))[0] || null;
}

async function getOrdersByUserIdInDateTime(userID, dateTime){
    const sql = `SELECT o.* FROM \`order\` o WHERE o.userID = ? AND o.dateTime > ?`;
    return (await query(sql, [userID, dateTime])) || null;
}

async function getPopularProductByUserId(userID) {
    const sql = `SELECT o.productID, p.name, COUNT(o.productID)
FROM \`order\` o
JOIN product p ON p.productID = o.productID
WHERE o.userID = ?
GROUP BY o.productID
ORDER BY COUNT(o.productID) DESC`;
    const productList = await query(sql, [userID]);

    if(productList && productList.length > 0){
        return productList[0];
    }
    return null;
}

async function getProductsWithCategoryAndEmotion(category, emotion) {
    const sql = `SELECT p.*
FROM product p
JOIN product_category pc ON p.productID = pc.productID 
JOIN category c ON pc.categoryID = c.categoryID
WHERE c.name = ? AND p.emotion = ?`; //TODO: SQL Abfrage für Emotion anpassen
    return await query(sql, [category, emotion]);
}

async function getProductsWithCategory(category) {
    const sql = `SELECT p.*
FROM product p
JOIN product_category pc ON p.productID = pc.productID 
JOIN category c ON pc.categoryID = c.categoryID
WHERE c.name = ?`;
    return await query(sql, [category]);

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

async function getCategoriesOfProduct(productID) {
    const sql = `SELECT c.*
                 FROM product p
                          JOIN product_category pc ON p.productID = pc.productID
                          JOIN category c ON pc.categoryID = c.categoryID
                 WHERE p.productID = ?`;
    return await query(sql, [productID]);
}

async function saveOrder(productID, userID) {
    const sql = "INSERT INTO `order` (productID, userID, dateTime) VALUES (?,?,?)"; //TODO: SQL Abfrage für Emotion anpassen
    return await query(sql, [productID, userID, moment().format('YYYY-MM-DD HH:mm:ss')]);
}

async function getPersonalProductRecommendation(userID) {
    //TODO may propose drinks, if no were bought recently. Or food, if only drinks were bought recently.

    /*
    * Get the products of the past four weeks of this user.
    * Calculate score of each product compared to current time.
    * Sum up scores.
    * Take product with the highest score.
    */

    const fourWeeksAgo = moment().subtract(4, 'weeks').format('YYYY-MM-DD HH:mm:ss');
    const orders = await getOrdersByUserIdInDateTime(userID, fourWeeksAgo);

    const productScores = {};

    orders.forEach(order => {
        if(order.dateTime) {
            const temporalSimilarity = new TemporalSimilarity(new Date(order.dateTime.toString().replace(/-/g,"/")));
            if(productScores.hasOwnProperty(order.productID)) {
                productScores[order.productID] += temporalSimilarity.getScore();
            } else {
                productScores[order.productID] = temporalSimilarity.getScore();
            }
        }
    });

    if(true) {
        for (let productId in productScores) {
            console.log('Product: ' + (await getProductById(productId)).name + ' \t Score:' + productScores[productId]);
        }
    }

    let bestScore = 0;
    let bestProductId = null;
    for (let productId in productScores) {
        if (productScores.hasOwnProperty(productId) && bestScore < productScores[productId]) {
            bestProductId = productId;
            bestScore = productScores[productId];
        }
    }
    return await getProductById(bestProductId)
}

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    async handle(handlerInput) {
        let speakOutput = '';
        const user = await getCurrentUser();
        if(user) {
            speakOutput += ` Hi ${user.name}! Welcome to our Vending Machine!`;
            const product = await getPersonalProductRecommendation(user.userID);
            if(product) {
                speakOutput += `I think you often chose ${product.name} at this time.` ;

                return handlerInput.responseBuilder
                    .addDelegateDirective({
                        name: 'consent',
                        confirmationStatus: 'NONE',
                        slots: {
                            "product": {
                                "name": "product",
                                "value": product.name,
                                //"resolutions": {},
                                "confirmationStatus": "NONE"
                            }
                        }
                    })
                    .speak(speakOutput)
                    .reprompt(speakOutput)
                    .getResponse();
            }

        } else {
            speakOutput += "Welcome to our Vending Machine! I don't know you yet.";
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(speakOutput)
                .addDelegateDirective({
                    name: 'RecordConsentIntent',
                    confirmationStatus: 'NONE',
                    slots: {}
                })
                .getResponse();
        }

        const emotion = await getCurrentEmotion();
        if (emotion === EMOTION_HAPPY) {
            speakOutput += ' Looks like you are very ' + emotion + ' today!';
        } else if (emotion === EMOTION_ANGRY) {
            speakOutput += ' I think your\'re angry! Tell me about your secrets!';
        } else if (emotion === EMOTION_SAD) {
            speakOutput += ' You look a bit down!'; //How can I cheer you up?
        } else if (emotion === EMOTION_SURPRISED) {
            speakOutput += ' Why are you suprised? What happend?';
        }
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .withSimpleCard("Welcome to our vending machine!", "You can say \"I am hungry\" or choose a specific product. For advice you can say \"I want to buy something\".")
            .getResponse();
    }
};

async function getCurrentEmotion() {
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
        throw "Maybe you haven't turned on the face detection server (0)." + e;
    }
}

async function getCurrentUser() {
    try {
        let user = null;
        const userName = await postData('http://localhost:3002/api/vending/load', {
            'vendingId': 0,
            'prop': 'userName'
        });
        if(userName)
            user = await getUserByName(userName);

        return user;
    } catch (e) {
        throw "Maybe you haven't turned on the face detection server (1)." + e;
    }
}

async function setMode(mode = { 'trainProfile': true }) {
    try {
        return Boolean(await postData('http://localhost:3002/api/vending/save', mode));
    } catch (e) {
        throw "Maybe you haven't turned on the face detection server (2). " + e;
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
    if (response.status === 204)
        return false;
    return response;
}

/**
 * Called when you ask for advice.
 * Offers drinks or snacks and asks back what you want.
 */
const AdviceIntentHandler = {
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
        let product = await getProductByName(productName);
        let responseBuilder = handlerInput.responseBuilder;
        let speakOutput;
        if (product) {
            const user = await getCurrentUser();
            speakOutput = 'It costs ' + product.price + ' €. ';
            if(!user) {
                speakOutput += "As you don't have a profile yet, you have to pay with cash. "
            }
            responseBuilder = responseBuilder.addDelegateDirective({
                name: 'consent',
                confirmationStatus: 'NONE',
                slots: {
                    "product": {
                        "name": "product",
                        "value": product.name,
                        //"resolutions": {},
                        "confirmationStatus": "NONE"
                    }
                }
            });

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
        } else {
            speakOutput = "Sorry, we don't sell this product.";
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
        let slotName = handlerInput.requestEnvelope.request.intent.slots.category_of_product.resolutions.resolutionsPerAuthority[0].values[0].value.name;
        const products = await getProductsWithCategory(slotName);
        const emotion = await getCurrentEmotion();
        const productsWithEmotions = await getProductsWithCategoryAndEmotion(slotName, emotion);

        // Extract product name, implode the array, and replace & with and, as alexa doesn't understand &.
        let productsStr;
        if(products.length > 1) {
            productsStr = products.slice(0, -1).map(product => product.name).join(', ').replace('&', ' and ');
            productsStr += ' and ' + products[products.length - 1].name;
        } else {
            productsStr = products[0];
        }
        const productsWithEmotionsStr = productsWithEmotions.map(product => product.name).join(', ').replace('&', ' and ');
        let speakOutput = '';
        if (emotion !== EMOTION_NEUTRAL) {
            if (emotion === "sad") {
                speakOutput += 'You look a bit down. ';
            } else {
                speakOutput += 'You look ' + emotion + '. ';
            }
            
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
        let slotAge = handlerInput.requestEnvelope.request.intent.slots.age.value;
        let success = false;
        let errorMessage;
        if (slotName) {
            try {
                // TODO pass age to db
                success = await setMode({'trainProfile': slotName});
            } catch (e) {
                errorMessage = e;
            }
        }
        console.log(slotName);
        let speakOutput;
        if (handlerInput.requestEnvelope.request.intent.confirmationStatus === 'DENIED')
            speakOutput = "It's a pity. You can try again if you want.";
        else if (handlerInput.requestEnvelope.request.intent.confirmationStatus === 'CONFIRMED') {
            speakOutput = success ? "I saved your profile, " + slotName + '. What do you want to buy?' :
                "I'm sorry, your profile couldn't be saved. " + errorMessage + ". Try again!";
        }


        return handlerInput.responseBuilder
            .speak(speakOutput)
            .addDelegateDirective({
                name: 'AdviceIntent',
                confirmationStatus: 'NONE',
                slots: {}
            })
            .getResponse();
    }
};

const AskToRememberFaceHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'ask_to_remember_face';
    },
    async handle(handlerInput) {
        const user = await getCurrentUser();
        if(user) {
            const product = await getPersonalProductRecommendation(user.userID);
            const speakOutput = `Of course ${user.name}. I think you often chose ${product.name}.` ;

            return handlerInput.responseBuilder
                .addDelegateDirective({
                    name: 'consent',
                    confirmationStatus: 'NONE',
                    slots: {
                        "product": {
                            "name": "product",
                            "value": product.name,
                            //"resolutions": {},
                            "confirmationStatus": "NONE"
                        }
                    }
                })
                .speak(speakOutput)
                .reprompt(speakOutput)
                .getResponse();
        }

        const speakOutput = "Sorry, I don't know you. Do you want that I remember you the next time?";
        // Todo delegative and then to face recognition.
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
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

const RecordConsentIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'RecordConsentIntent';
    },
    async handle(handlerInput) {
        let speakOutput;
        if (handlerInput.requestEnvelope.request.intent.confirmationStatus === 'DENIED')
            speakOutput = "It's a pity. Then I can't provide personal recommendations for you. But you still can buy something. Are you hungry or thirsty?";
        else if (handlerInput.requestEnvelope.request.intent.confirmationStatus === 'CONFIRMED') {
            return handlerInput.responseBuilder
                .addDelegateDirective({
                    name: 'record_face',
                    confirmationStatus: 'NONE',
                    slots: {}
                })
                .getResponse();
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const ConsentIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'consent';
    },
    async handle(handlerInput) {
        speakOutput = "No confirmation";

        var confirm = handlerInput.requestEnvelope.request.intent.confirmationStatus;
        console.log(confirm);

        if (handlerInput.requestEnvelope.request.intent.confirmationStatus === 'DENIED')
            speakOutput = "It's a pity! Then choose something else.";
        else if (handlerInput.requestEnvelope.request.intent.confirmationStatus === 'CONFIRMED') {
            const productName = handlerInput.requestEnvelope.request.intent.slots.product.value;
            console.log(productName);
            const user = await getCurrentUser();
            const product = await getProductByName(productName);
            const categories = await getCategoriesOfProduct(product.productID)
            const isDrink = categories.map(c => c.name).includes('drink');
            await saveOrder(product.productID, user ? user.userID : null);
            speakOutput = `You bought the ${productName}. ${isDrink ? 'Cheers' : 'Bon appetit'}!`;
        }

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
        AdviceIntentHandler,
        CategoryOfDecisionIntentHandler,
        HowMuchIntentHandler,
        ConsentIntentHandler,
        RecordConsentIntentHandler,
        StopIntentHandler,
        HelpIntentHandler,
        RecordFaceHandler,
        AskToRememberFaceHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler, // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
    )
    .addErrorHandlers(
        ErrorHandler,
    )
    .lambda();