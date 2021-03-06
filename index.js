/**
 * Automatic Image resize, reduce with AWS Lambda
 * Lambda main handler
 *
 * @author Yoshiaki Sugimoto
 * @created 2015/10/29
 */
"use strict";
const ImageData    = require("./libs/ImageData");
const ImageProcessor = require("./libs/ImageProcessor");
const Config         = require("./libs/Config");
const S3             = require("./libs/S3");
const fs             = require("fs");
const path           = require("path");
const _ 			 = require('lodash');


// Lambda Handler
exports.handler = function(event, context) {
    var s3Object;
    if(event.Records) {
           s3Object = event.Records[0].s3;
    }
    var configPath = path.resolve(__dirname, "config.json");
    var config     = new Config(JSON.parse(fs.readFileSync(configPath, { encoding: "utf8" })));

    if(event.base64Image) {
        var buffer = new Buffer(event.base64Image, 'base64');
        var headers = { ContentType: 'image/jpeg', CacheControl: 'no-cache', ImgProcessed: 'false' };
        var fullname = config.get("source-directory") + event.fileName;
        //S3.putObject(config.get("source-bucket") , fullname, buffer, headers)
        S3.putObject(new ImageData(
                fullname,
                config.get("source-bucket"),
                buffer,
                headers,
                config.get("acl")
            ))
        .then(function(data) {
            console.log(event.fileName + " uploaded.");
            s3Object = {object: {eTag : '', key: '', size: 1}, bucket: {name: ''}};
            _.update(s3Object, 'object.eTag', function(originalValue) { return data.ETag});
            _.update(s3Object, 'object.key', function(originalValue) { return fullname});
            _.update(s3Object, 'object.size', function(originalValue) { return 1});
            _.update(s3Object, 'bucket.name', function(originalValue) { return config.get("source-bucket")});

            console.log("s3Object: " + s3Object.object.key);
            var processor  = new ImageProcessor(s3Object);
            processor.run(config)
            .then(function(proceedImages) {
                console.log("OK, numbers of " + proceedImages + " images has proceeded.");
                context.succeed("OK, numbers of " + proceedImages + " images has proceeded.");
            })
            .catch(function(messages) {
                if(messages == "Object was already processed."){
                    console.log("Image already processed");
                    context.succeed("Image already processed");
                }
                else {
                    context.fail("Woops, image process failed: " + messages);
                }
            });
        })
        .catch(function(message) {
            console.log(message);
            context.fail("Woops, image upload failed: " + message);
        }); 
    } else {
        processor.run(config)
        .then((processedImages) => {
            var message = "OK, " + processedImages + " images were processed.";
            console.log(message);
            context.succeed(message);
        })
        .catch((messages) => {
            if ( messages === "Object was already processed." ) {
                console.log("Image already processed");
                context.succeed("Image already processed");
            } else {
                context.fail("Error processing " + s3Object.object.key + ": " + messages);
            }
        });
	}    
};
