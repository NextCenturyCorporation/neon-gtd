'use strict';
/*
 * Copyright 2016 Next Century Corporation
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
.factory("ThemeService", ["config", function(config) {
    var service = {};

    var listeners = {};

    var themes = [{
        name: "Light Green",
        file: "light-green",
        type: "light",
        accentColor: "#39B54A",
        backgroundColor: "#FFFFFF",
        textColor: "#777777"
    }, {
        name: "Dark Green",
        file: "dark-green",
        type: "dark",
        accentColor: "#39B54A",
        backgroundColor: "#1B313D",
        textColor: "#85949C"
    /*
    }, {
        name: "Dark Purple",
        file: "dark-purple",
        type: "dark",
        accentColor: "#A654A1",
        backgroundColor: "#1B313D"
    */
    }]

    var theme = _.find(themes, function(theme) {
        return theme.name === config.theme;
    }) || themes[0];

    service.registerListener = function(id, listener) {
        if(id && _.isFunction(listener)) {
            listeners[id] = listener;
            // Call the listener immediately so the visualization knows the current theme.
            listener(theme);
        }
    };

    service.unregisterListener = function(id) {
        if(listeners[id]) {
            delete listeners[id];
        }
    };

    service.getThemes = function() {
        return themes;
    };

    service.getTheme = function() {
        return theme;
    };

    service.setTheme = function(name) {
        var previous = theme.name;
        theme = _.find(themes, function(theme) {
            return theme.name === name;
        }) || theme;

        if(previous !== theme.name) {
            Object.keys(listeners).forEach(function(key) {
                listeners[key](theme);
            });
        }
    };

    return service;
}]);
