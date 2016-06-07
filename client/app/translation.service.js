'use strict';
/*
 * Copyright 2015 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

angular.module("neonDemo.services")
.factory("TranslationService", ["config", "$http", "$q", "ConnectionService", function(config, $http, $q, connectionService) {
    var service = {};

    var apis = {
        google: {
            base: "https://www.googleapis.com/language/translate/v2",
            key: (config.translationKeys) ? config.translationKeys.google : undefined,
            methods: {
                translate: "",
                detect: "/detect",
                languages: "/languages"
            },
            params: {
                key: "key",
                from: "source",
                to: "target",
                text: "q",
                other: ["format=text"]
            },
            languages: {}
        }
    };

    var chosenApi;
    var translationCache = {};

    /**
     * Sets the default translation service.
     * @param {String} serviceName Name of the service to set as default.
     * @param {Function} successCallback
     * @param {Function} failureCallback
     * @method setService
     */
    service.setService = function(serviceName, successCallback, failureCallback) {
        chosenApi = serviceName;

        if(!apis[chosenApi].key) {
            if(failureCallback) {
                failureCallback({
                    message: "No key available",
                    reason: "No key set for " + chosenApi
                });
            }
        } else if(!apis[chosenApi].languages || _.keys(apis[chosenApi].languages).length === 0) {
            setSupportedLanguages().then(successCallback, failureCallback);
        } else {
            if(successCallback) {
                successCallback();
            }
        }
    };

    /**
     * Returns all the available translation services.
     * @method getAllServices
     * @return {Array} List of all the translation services.
     */
    service.getAllServices = function() {
        return _.keys(apis);
    };

    /**
     * If the service being used has an API key.
     * @method hasKey
     * @return {Boolean} True if there is an API key being used, false otherwise.
     */
    service.hasKey = function() {
        return apis[chosenApi].key ? true : false;
    };

    /**
     * Translates all strings in text with language code specified in 'from' to the language
     * code specified in 'to'. If no 'from' is provided, it will be automatically detected.
     * @param {Array} text List of strings to translate
     * @param {String} to Language code to translate all text to.
     * @param {Function} successCallback
     * @param {Function} failureCallback
     * @param {String} [from] Optional language code that all the text are in. If none is
     * provided then it will be detected for each string individually in the text array.
     * @method translate
     */
    service.translate = function(text, to, successCallback, failureCallback, from) {
        if(!apis[chosenApi].key) {
            failureCallback({
                message: "Key not provided",
                reason: "Key not provided"
            });
        } else if(!text.length) {
            failureCallback({
                message: "No text provided",
                reason: "No text provided"
            });
        } else {
            translationCache[to] = translationCache[to] || {};

            var translateCallback = function() {
                var deferred = $q.defer();

                var params = apis[chosenApi].params.key + "=" + apis[chosenApi].key;

                apis[chosenApi].params.other.forEach(function(param) {
                    params += "&" + param;
                });

                var cached = [];

                text.forEach(function(elem) {
                    if(translationCache[to][elem]) {
                        // Add a blank parameter so their indices match the indices of the list of cached translations.
                        params += "&" + apis[chosenApi].params.text + "=";
                        cached.push(translationCache[to][elem]);
                    } else {
                        params += "&" + apis[chosenApi].params.text + "=" + encodeURIComponent(elem);
                        // Add a blank element to the list of cached translations so its indices match the indices of the parameters.
                        cached.push("");
                    }
                });

                if(!to || !apis[chosenApi].languages[to]) {
                    deferred.reject({
                        message: "Unknown target language",
                        reason: "Unknown target language"
                    });
                    return deferred.promise;
                }

                params += "&" + apis[chosenApi].params.to + "=" + to;

                // If no 'from' (source) language is given, each text is auto-detected individually.
                // If it does exist, check that the language code is in the set of supported languages
                if(from && !apis[chosenApi].languages[from]) {
                    deferred.reject({
                        message: "Unknown source language",
                        reason: "Unknown source language"
                    });
                    return deferred.promise;
                } else if(from) {
                    params += "&" + apis[chosenApi].params.from + "=" + from;
                }

                $http.get(apis[chosenApi].base + apis[chosenApi].methods.translate + "?" + params)
                    .then(function(response) {
                        // Cache the translations for later use.
                        response.data.data.translations.forEach(function(item, index) {
                            if(!cached[index]) {
                                translationCache[to][text[index]] = item.translatedText;
                            }
                        });
                        // Add the cached translations in the response data for the callback.
                        cached.forEach(function(item, index) {
                            if(item) {
                                response.data.data.translations[index].translatedText = item;
                            }
                        });
                        deferred.resolve(response);
                    }, function(response) {
                        var rejection = {
                            message: "",
                            reasion: ""
                        };
                        if(response && response.data && response.data.error) {
                            rejection.message = response.data.error.message;
                            rejection.reason = concatErrorResponses(response.data.error.errors);
                        }
                        deferred.reject(rejection);
                    });

                return deferred.promise;
            };

            if(!apis[chosenApi].languages || _.keys(apis[chosenApi].languages).length === 0) {
                setSupportedLanguages().then(translateCallback().then(successCallback, failureCallback), failureCallback);
            } else {
                translateCallback().then(successCallback, failureCallback);
            }
        }
    };

    /**
     * Retrieves all languages supported by the default translation service.
     * @param {Function} successCallback
     * @param {Function} failureCallback
     * @method getSupportedLanguages
     */
    service.getSupportedLanguages = function(successCallback, failureCallback) {
        if(!apis[chosenApi].languages || _.keys(apis[chosenApi].languages).length === 0) {
            setSupportedLanguages().then(successCallback, failureCallback);
        } else {
            successCallback(apis[chosenApi].languages);
        }
    };

    /**
     * Retrieves and sets all languages supported by the default translation service.
     * @method setSupportedLanguages
     * @return {Promise}
     * @private
     */
    var setSupportedLanguages = function() {
        var deferred = $q.defer();

        var params = apis[chosenApi].params.key + "=" + apis[chosenApi].key +
            "&" + apis[chosenApi].params.to + "=en";

        $http.get(apis[chosenApi].base + apis[chosenApi].methods.languages + "?" + params)
            .then(function(response) {
                _.forEach(response.data.data.languages, function(elem) {
                    apis[chosenApi].languages[elem.language] = elem.name;
                });
                deferred.resolve(apis[chosenApi].languages);
            }, function(response) {
                deferred.reject({
                    message: response.data.error.message,
                    reason: concatErrorResponses(response.data.error.errors)
                });
            });

        return deferred.promise;
    };

    /**
     * Helper method to combine a list of errors and their reasons into one string.
     * @param {Array} errors Array of errors containing reasons for the error.
     * @param {String} errors[].reason Reason for a particular error.
     * @method concatErrorResponses
     * @return {String} All the error reasons in one string.
     * @private
     */
    var concatErrorResponses = function(errors) {
        var reasons = "Reasons:\n";
        _.forEach(errors, function(error) {
            reasons += error.reason + "\n";
        });
        return reasons;
    };

    /**
     * Loads the translation cache by asking the Neon server.
     * @method loadTranslationCache
     * @private
     */
    var loadTranslationCache = function() {
        var connection = connectionService.getActiveConnection();
        if(connection) {
            connection.getTranslationCache(function(response) {
                translationCache = JSON.parse(response);
            });
        }
    };

    /**
     * Saves the translation cache by sending it to the Neon server.
     * @method saveTranslationCache
     */
    service.saveTranslationCache = function() {
        var connection = connectionService.getActiveConnection();
        if(connection) {
            connection.setTranslationCache(translationCache);
        }
    };

    service.setService("google");

    loadTranslationCache();

    return service;
}]);
