const video = document.getElementById('video');

Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('models'),
    faceapi.nets.faceLandmark68Net.loadFromUri('models'),
    faceapi.nets.faceRecognitionNet.loadFromUri('models'),
    faceapi.nets.faceExpressionNet.loadFromUri('models')
]).then(startVideo);

function startVideo() {
    navigator.getUserMedia = (navigator.getUserMedia ||
        navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia ||
        navigator.msGetUserMedia);

    navigator.getUserMedia(
        {video: {}},
        stream => video.srcObject = stream,
        err => {
            if (err.name == 'NotReadableError') {
                alert('Webcam already in use!')
            }
            console.error(err);
        }
    )
}

video.addEventListener('play', async () => {
    const canvas = faceapi.createCanvasFromMedia(video);
    document.body.append(canvas);
    const displaySize = {width: video.width, height: video.height};
    faceapi.matchDimensions(canvas, displaySize);

    const profiles = {};
    const labeledDescriptors = [];

    // Load saved profiles
    const savedProfiles = await postData('/api/profiles/load');
    console.log('Saved profiles: ' + Object.keys(savedProfiles));
    await convertProfilesToLabeledDescriptors(savedProfiles, labeledDescriptors);

    setInterval(async () => {
        const trainProfil = await postData('/api/vending/load', {
            'prop': 'trainProfile'
        });

        const detector = new faceapi.TinyFaceDetectorOptions({
            // FIXME:
            // https://github.com/justadudewhohacks/face-api.js/issues/282
            // https://github.com/justadudewhohacks/face-api.js/issues/125
            // inputSize: 256, // this line solves 'Box.constructor - expected box to be IBoundingBox | IRect, instead ...'
            // scoreThreshold: 0.5,
        });

        if (trainProfil) {
            const detection = await faceapi.detectSingleFace(video, detector)
                .withFaceLandmarks()
                .withFaceExpressions()
                .withFaceDescriptor();
            if (detection) {
                if (!profiles[trainProfil])
                    profiles[trainProfil] = {descriptors: []};
                profiles[trainProfil].descriptors.push(detection.descriptor);
                if (profiles[trainProfil].descriptors.length > 2) {
                    await setMode({'trainProfile': false});
                }
            }
        } else {
            const detections = await faceapi.detectAllFaces(video, detector)
                .withFaceLandmarks()
                .withFaceExpressions()
                .withFaceDescriptors();
                // .withAgeAndGender()
            // console.log(detections);

            if (detections.length > 0) {

                if (Object.keys(profiles).length > 0) {
                    await convertProfilesToLabeledDescriptors(profiles, labeledDescriptors);
                    await saveProfiles(profiles);
                }

                if (labeledDescriptors.length > 0) {
                    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors);
                    detections.forEach(fd => {
                        const maxDescriptorDistance = 0.6;
                        const bestMatch = faceMatcher.findBestMatch(fd.descriptor, maxDescriptorDistance);
                        //console.log(bestMatch.toString());
                        fd.bestMatch = bestMatch;
                    });
                }

                const resizedDetections = faceapi.resizeResults(detections, displaySize);
                canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
                resizedDetections.forEach(detection => {
                    const box = detection.detection.box;
                    const drawBox = new faceapi.draw.DrawBox(box, {label: detection.bestMatch});
                    drawBox.draw(canvas);
                });
                //faceapi.draw.drawDetections(canvas, resizedDetections);
                faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
                faceapi.draw.drawFaceExpressions(canvas, resizedDetections);
                // faceapi.draw.draw()

                await postData('/api/vending/save', {'expressions': detections[0].expressions});
            }
        }
    }, 500)
});

async function setMode(mode = {'trainProfile': true}) {
    try {
        return Boolean(await postData('/api/vending/save', mode));
    } catch (e) {
        throw "Maybe you haven't turned on the face detection server. " + e;
    }
}

async function convertProfilesToLabeledDescriptors(profiles, labeledDescriptors) {
    for (let key in profiles) {
        if (profiles.hasOwnProperty(key)) {
            const descriptors = profiles[key].descriptors.map(function (value) {
                if(value instanceof Float32Array)
                    return value;
                // TODO may use other function than object.values, which better map the keys
                return new Float32Array(Object.values(value));
            });
            labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(
                key,
                descriptors
            ));
        }
    }
}

async function saveProfiles(profiles) {
    await postData('/api/profiles/save', profiles);
    for (let key in profiles) {
        if (profiles.hasOwnProperty(key)) {
            console.log('Save profile ' + key);
            delete profiles[key];
        }
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
    if (response.status >= 400)
        throw response.status + ' (' + response.statusText + ')';
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        return await response.json(); // parses JSON response into native JavaScript objects
    }
    if (response.status === 204)
        return false;
    return response;
}