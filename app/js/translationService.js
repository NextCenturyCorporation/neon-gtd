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
.factory("TranslationService", ["config", "$http", "$q", function(config, $http, $q) {
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
                text: "q"
            },
            languages: {}
        }
    };

    var chosenApi = "google";
    var defaultFromLanguage;
    var defaultToLanguage = "en";

    /**
     * Sets the default translation service.
     * @param {String} serviceName Name of the service to set as default.
     * @method setService
     */
    service.setService = function(serviceName) {
        chosenApi = serviceName;

        if(!apis[chosenApi].languages || _.keys(apis[chosenApi].languages).length === 0) {
            setSupportedLanguages();
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
     * Translates all strings in text with language code specified in 'from' to the language
     * code specified in 'to'. If no 'from' is provided, it will be automatically detected.
     * @param {Array} text List of strings to translate
     * @param {String} to Language code to translate all text to.
     * @param {String} from Optional language code that all the text are in. If none is
     * provided then it will be detected for each string in the text array.
     * @method translate
     * @return {Promise}
     */
    service.translate = function(text, to, from) {
        if(!apis[chosenApi].key) {
            return $q.reject("Key not provided");
        }

        var params = apis[chosenApi].params.key + "=" + apis[chosenApi].key;

        text.forEach(function(elem) {
            params += "&" + apis[chosenApi].params.text + "=" + encodeURI(elem);
        });

        if(to && !apis[chosenApi].languages[to]) {
            return $q.reject("Unknown target language");
        }

        params += "&" + apis[chosenApi].params.to + "=" + (to ? to : defaultToLanguage);

        if(from && !apis[chosenApi].languages[from]) {
            return $q.reject("Unknown source language");
        } else if(from) {
            params += "&" + apis[chosenApi].params.from + "=" + from;
        } else if(!from && defaultFromLanguage) {
            params += "&" + apis[chosenApi].params.from + "=" + defaultFromLanguage;
        }

        var deferred = $q.defer();

        $http.get(apis[chosenApi].base + apis[chosenApi].methods.translate + "?" + params)
            .then(function(response) {
                deferred.resolve(response);
            }, function(response) {
                deferred.reject(response);
            });

        return deferred.promise;
    };

    /**
     * Sets the default language text is read as. If no language is provided, the default is detection.
     * @param {String} [from] The language code to set as default. If no value is provided, the default is detection.
     * @method setDefaultFromLanguage
     * @return {Boolean} Returns true if the language is supported by the default translation
     * service, otherwise returns false and the default 'from' language is unchanged.
     */
    service.setDefaultFromLanguage = function(from) {
        if(from && !apis[chosenApi].languages[from]) {
            return false;
        }
        defaultFromLanguage = from;

        return true;
    };

    /**
     * Returns the current default language text is read as.
     * @method setDefaultFromLanguage
     * @return {String} The default language code text is read as.
     */
    service.getDefaultFromLanguage = function() {
        return defaultFromLanguage;
    };

    /**
     * Sets the default language to translate text to.
     * @param {String} to The language code to set as default
     * @method setDefaultToLanguage
     * @return {Boolean} Returns true if the language is supported by the default translation
     * service, otherwise returns false and the default 'to' language is unchanged.
     */
    service.setDefaultToLanguage = function(to) {
        if(to && !apis[chosenApi].languages[to]) {
            return false;
        }
        defaultToLanguage = to;

        return true;
    };

    /**
     * Returns the current default language text is translated to.
     * @method getDefaultToLanguage
     * @return {String} The default language code text is translated to.
     */
    service.getDefaultToLanguage = function() {
        return defaultToLanguage;
    };

    /**
     * Returns all languages supported by the default translation service.
     * @method getSupportedLanguages
     * @return {Object} Map of language codes to language names (in the default 'to' language)
     */
    service.getSupportedLanguages = function() {
        return apis[chosenApi].languages;
    };

    /**
     * Retrieves and sets all languages supported by the default translation service.
     * @method setSupportedLanguages
     * @private
     */
    var setSupportedLanguages = function() {
        var params = apis[chosenApi].params.key + "=" + apis[chosenApi].key +
            "&" + apis[chosenApi].params.to + "=" + defaultToLanguage;

        $http.get(apis[chosenApi].base + apis[chosenApi].methods.languages + "?" + params)
            .then(function(response) {
                _.forEach(response.data.data.languages, function(elem) {
                    apis[chosenApi].languages[elem.language] = elem.name;
                });
            }, function(response) {
                console.error("Error retrieving translation languages -> " + response.data.error.message);
            });
    };

    setSupportedLanguages();

    return service;
}]);
