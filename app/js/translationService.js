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

    service.GOOGLE = "google";

    service.apis = {
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
            }
        }
    };

    service.chosenApi = service.GOOGLE;
    service.defaultFromLanguage = undefined;
    service.defaultToLanguage = "en";

    service.setService = function(serviceId) {
        service.chosenApi = serviceId;
    };

    service.translate = function(text, to, from) {
        if(!service.apis[service.chosenApi].key) {
            return $q.reject("Key not provided");
        }

        var params = service.apis[service.chosenApi].params.key + "=" + service.apis[service.chosenApi].key;

        text.forEach(function(elem) {
            params += "&" + service.apis[service.chosenApi].params.text + "=" + encodeURI(elem);
        });

        if(to && !translationLanguages[service.chosenApi][to]) {
            return $q.reject("Unknown target language");
        }

        params += "&" + service.apis[service.chosenApi].params.to + "=" + (to ? to : service.defaultToLanguage);

        if(from && !translationLanguages[service.chosenApi][from]) {
            return $q.reject("Unknown source language");
        } else if(from) {
            params += "&" + service.apis[service.chosenApi].params.from + "=" + from;
        } else if(!from && service.defaultFromLanguage) {
            params += "&" + service.apis[service.chosenApi].params.from + "=" + service.defaultFromLanguage;
        }

        var deferred = $q.defer();

        $http.get(service.apis[service.chosenApi].base + service.apis[service.chosenApi].methods.translate + "?" + params)
            .then(function(response) {
                deferred.resolve(response);
            }, function(response) {
                deferred.reject(response);
            });

        return deferred.promise;
    };

    service.setDefaultFromLanguage = function(from) {
        if(from && !translationLanguages[service.chosenApi][from]) {
            return false;
        }
        service.defaultFromLanguage = from;

        return true;
    };

    service.setDefaultToLanguage = function(to) {
        if(to && !translationLanguages[service.chosenApi][to]) {
            return false;
        }
        service.defaultToLanguage = to;

        return true;
    };

    return service;
}]);
