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

angular.module('neonDemo.services')
.factory('LinksPopupService', ["$sce", function($sce) {
    var service = {
        sourcesToKeysToLinks: {},
        keysToKeyMaps: {},
        listeners: []
    };

    /**
     * Registers the on-show-modal listener for the links popup.
     * @method registerLinksPopupModalListener
     */
    service.registerLinksPopupModalListener = function() {
        $(".links-popup").on("show.bs.modal", function(event) {
            // Set the link data for the links popup using the source and key from the triggering button.
            var button = $(event.relatedTarget);
            var json = button.data("links-json");
            // The JSON may be a string or an object depending on whether it was set using angular or jQuery.
            json = _.isString(json) ? $.parseJSON(json) : json;
            service.showLinks(json || []);
        });
    };

    /**
     * Saves the given listener to alert during showLinks.
     * @param {Function} listener
     * @method registerListener
     */
    service.registerListener = function(listener) {
        service.listeners.push(listener);
    };

    /**
     * Cleans and returns the given collection of links by replacing variables in the links with values as needed.
     * @param {Object} data
     * @method cleanLinks
     * @private
     * @return {Object}
     */
    var cleanLinks = function(keysToLinks) {
        var cleanedKeysToLinks = {};
        Object.keys(keysToLinks).forEach(function(key) {
            var links = keysToLinks[key];
            var cleanedLinks = [];
            links.forEach(function(link) {
                if(link.url && link.name && link.image && link.args && link.data) {
                    link.tab = link.tab || link.name;

                    if(link.image.charAt(0) === '/') {
                        link.image = '.' + link.image;
                    }

                    var args = {};

                    // For each argument, replace the starting value (a neon mapping) with the value corresponding to that neon mapping in the data.
                    link.args.forEach(function(linkArg) {
                        var argsMappings = angular.copy(linkArg.mappings);

                        if(_.isString(argsMappings)) {
                            Object.keys(link.data).forEach(function(neonMapping) {
                                if(argsMappings === neonMapping) {
                                    argsMappings = link.data[neonMapping];
                                }
                            });
                        } else {
                            Object.keys(link.data).forEach(function(neonMapping) {
                                Object.keys(argsMappings).forEach(function(argMapping) {
                                    if(link.data[neonMapping][argsMappings[argMapping]]) {
                                        argsMappings[argMapping] = link.data[neonMapping][argsMappings[argMapping]];
                                    }
                                });
                            });
                        }

                        args[linkArg.variable] = argsMappings;
                    });

                    // Use the Mustache library to replace the JSON variables in the URL with the given arguments.
                    link.url = Mustache.render(link.url, args);

                    // Notify angular that this is a trusted URL so angular will inject it into a form's action.
                    link.url = $sce.trustAsResourceUrl(link.url);

                    cleanedLinks.push(link);
                }
            });
            cleanedKeysToLinks[key] = cleanedLinks;
        });
        return cleanedKeysToLinks;
    };

    /**
     * Cleans the given links and sets them as the links popup data for the given source.
     * @param {String} source
     * @param {Array} links
     * @method setLinks
     */
    service.setLinks = function(source, links) {
        service.sourcesToKeysToLinks[source] = cleanLinks(links);
    };

    /**
     * Sets the view of the links popup to the link data for the given sources at the given keys.
     * @param {Array} list A list of objects containing {String} source and {String} key
     * @method showLinks
     */
    service.showLinks = function(list) {
        var keysToLinks = {};
        list.forEach(function(object) {
            keysToLinks[object.key] = (service.sourcesToKeysToLinks[object.source] ? service.sourcesToKeysToLinks[object.source][object.key] : []) || [];
        });
        service.listeners.forEach(function(listener) {
            listener(keysToLinks);
        });
    };

    /**
     * Adds the given links to the links popup data for the given source and key.
     * @param {String} source
     * @param {String} key
     * @param {Array} links
     * @method addLinks
     */
    service.addLinks = function(source, key, links) {
        service.sourcesToKeysToLinks[source] = service.sourcesToKeysToLinks[source] || {};
        var keysToLinks = {};
        keysToLinks[key] = links;
        service.sourcesToKeysToLinks[source][key] = (cleanLinks(keysToLinks))[key];
    };

    /**
     * Removes the links in the links popup data for the given source at the given key, if it exists.
     * @param {String} source
     * @param {String} key
     * @method removeLinksForKey
     */
    service.removeLinksForKey = function(source, key) {
        if(service.sourcesToKeysToLinks[source] && service.sourcesToKeysToLinks[source][key]) {
            delete service.sourcesToKeysToLinks[source][key];
        }
    };

    /**
     * Deletes the links popup data for the given source, if it exists.
     * @param {String} source
     * @method deleteLinks
     */
    service.deleteLinks = function(source) {
        if(service.sourcesToKeysToLinks[source]) {
            delete service.sourcesToKeysToLinks[source];
        }
    };

    /**
     * Creates and returns the HTML for a link using the given source, key, and tooltip.
     * @param {String} source
     * @param {String} key
     * @param {String} tooltip
     * @method createLinkHtml
     * @return {String}
     */
    service.createLinkHtml = function(source, key, tooltip) {
        return service.createLinkHtmlFromList([{
            source: source,
            key: key
        }]);
    };

    /**
     * Creates and returns the HTML for a link using the given tooltip and the sources and keys in the given list.
     * @param {Array} list A list of {Object} objects containing {String} source and {String} key
     * @param {String} tooltip
     * @method createLinkHtmlFromList
     * @return {String}
     */
    service.createLinkHtmlFromList = function(list, tooltip) {
        return Mustache.render(service.ENABLED_TEMPLATE, {
            tooltip: tooltip,
            json: service.createButtonJsonFromList(list)
        });
    };

    /**
     * Creates and returns the JSON string for a button that opens the links popup using the given source and key.
     * @param {String} source
     * @param {String} key
     * @method createButtonJson
     * @return {String}
     */
    service.createButtonJson = function(source, key) {
        return service.createButtonJsonFromList([{
            source: source,
            key: key
        }]);
    };

    /**
     * Creates and returns the JSON string for a button that opens the links popup using the sources and keys in the given list.
     * @param {Array} list A list of {Object} objects containing {String} source and {String} key
     * @method createButtonJsonFromList
     * @return {String}
     */
    service.createButtonJsonFromList = function(list) {
        var json = [];
        list.forEach(function(item) {
            if(item.source && item.key) {
                json.push("{\"source\":\"" + item.source + "\",\"key\":\"" + item.key + "\"}");
            }
        });
        return "[" + json.join(",") + "]";
    };

    /**
     * Creates and returns the HTML for a disabled link using the given tooltip.
     * @param {String} tooltip
     * @method createDisabledLinkHtml
     * @return {String}
     */
    service.createDisabledLinkHtml = function(tooltip) {
        return Mustache.render(service.DISABLED_TEMPLATE, {
            tooltip: tooltip
        });
    };

    /**
     * Creates and returns the service link object for the app with the given name using the given external service object and data collection of mappings to field values.
     * @param {Object} serviceObject
     * @param {String} appName
     * @param {Object} data A list of objects containing {String} mapping and {Number} or {String} value
     * @method createServiceLinkObjectWithData
     * @return {Object}
     */
    service.createServiceLinkObjectWithData = function(serviceObject, appName, data) {
        return {
            name: appName,
            image: serviceObject.apps[appName].image,
            url: serviceObject.apps[appName].url,
            args: serviceObject.args,
            data: data
        };
    };

    /**
     * Creates and returns the service link objects for the app with the given name using the given external service object, Neon mapping, and field value.
     * @param {Object} serviceObject
     * @param {String} appName
     * @param {String} neonMapping
     * @param {Number} or {String} value
     * @method createServiceLinkObject
     * @return {Object}
     */
    service.createServiceLinkObject = function(serviceObject, appName, neonMapping, value) {
        var data = {};
        data[neonMapping] = value;
        return service.createServiceLinkObjectWithData(serviceObject, appName, data);
    };

    /**
     * Creates and returns the service link objects for the given field and value using the given lists of external service objects and Neon mappings for the active dataset.
     * returns the number of links that were created.
     * @param {Array} serviceObjects
     * @param {Array} neonMappings
     * @param {String} field
     * @param {Number} or {String} value
     * @method createAllServiceLinkObjects
     * @return {Array}
     */
    service.createAllServiceLinkObjects = function(serviceObjects, neonMappings, field, value) {
        var links = [];

        // For each mapping to the given field, if services exist for that mapping, create the links for the services.
        Object.keys(neonMappings).filter(function(neonMapping) {
            return neonMappings[neonMapping] === field;
        }).forEach(function(neonMapping) {
            if(serviceObjects[neonMapping]) {
                Object.keys(serviceObjects[neonMapping].apps).forEach(function(appName) {
                    links.push(service.createServiceLinkObject(serviceObjects[neonMapping], appName, neonMapping, value));
                });
            }
        });

        return links;
    };

    /**
     * Returns the key for the given field object and value.
     * @param {Object} fieldObject
     * @param {Number} or {String} value
     * @method generateKey
     * @return {String}
     */
    service.generateKey = function(fieldObject, value) {
        if(fieldObject.prettyName) {
            var keyMap = generateKeyMap(fieldObject.prettyName, value);
            var key = generateKeyFromKeyMap(keyMap);
            service.keysToKeyMaps[key] = keyMap;
            return key;
        }
        return value;
    };

    var generateKeyMap = function(field, value) {
        var keyMap = {};
        keyMap[field] = value;
        return keyMap;
    };

    var generateKeyFromKeyMap = function(keyMap) {
        var key = "";
        Object.keys(keyMap).forEach(function(mapping) {
            if(!key) {
                key += ",";
            }
            key += mapping + "=" + keyMap[mapping];
        });
        return key;
    };

    /**
     * Returns the key for bounds with the given minimum and maximum latitude and longitude values.
     * @param {Number} minLat
     * @param {Number} minLon
     * @param {Number} maxLat
     * @param {Number} maxLon
     * @method generateBoundsKey
     * @return {String}
     */
    service.generateBoundsKey = function(minLat, minLon, maxLat, maxLon) {
        var keyMap = generateBoundsKeyMap(minLat, minLon, maxLat, maxLon);
        var key = generateKeyFromKeyMap(keyMap);
        service.keysToKeyMaps[key] = keyMap;
        return key;
    };

    var generateBoundsKeyMap = function(minLat, minLon, maxLat, maxLon) {
        return {
            latitude: minLat + " to " + maxLat,
            longitude: minLon + " to " + maxLon
        };
    };

    /**
     * Returns the key for a point with the given latitude and longitude values.
     * @param {Number} latitude
     * @param {Number} longitude
     * @method generatePointKey
     * @return {String}
     */
    service.generatePointKey = function(latitude, longitude) {
        var keyMap = generatePointKeyMap(latitude, longitude);
        var key = generateKeyFromKeyMap(keyMap);
        service.keysToKeyMaps[key] = keyMap;
        return key;
    };

    var generatePointKeyMap = function(latitude, longitude) {
        return {
            latitude: latitude,
            longitude: longitude
        };
    };

    /**
     * Returns the key for a date range with the given start and end values.
     * @param {Number} or {String} start
     * @param {Number} or {String} end
     * @method generateDateRangeKey
     * @return {String}
     */
    service.generateDateRangeKey = function(start, end) {
        var keyMap = generateDateRangeKeyMap(start, end);
        var key = generateKeyFromKeyMap(keyMap);
        service.keysToKeyMaps[key] = keyMap;
        return key;
    };

    var generateDateRangeKeyMap = function(start, end) {
        return {
            date: start + " to " + end
        };
    };

    /**
     * Returns the key for the given mapping for multiple services with the given data.
     * @param {String} servicesMapping
     * @param {Object} data
     * @method generateMultipleServicesKey
     * @return {String}
     */
    service.generateMultipleServicesKey = function(servicesMapping, data) {
        var keyMap = {};
        servicesMapping.split(",").forEach(function(neonMapping) {
            if(neonMapping === neonMappings.DATE) {
                var dateKeyMap = generateDateRangeKeyMap(data[neonMappings.DATE][neonMappings.START_DATE], data[neonMappings.DATE][neonMappings.END_DATE]);
                keyMap.date = dateKeyMap.date;
            } else if(neonMapping === neonMappings.BOUNDS) {
                var boundsKeyMap = generateBoundsKeyMap(data[neonMappings.BOUNDS][neonMappings.MIN_LAT], data[neonMappings.BOUNDS][neonMappings.MIN_LON], data[neonMappings.BOUNDS][neonMappings.MAX_LAT], data[neonMappings.BOUNDS][neonMappings.MAX_LON]);
                keyMap.latitude = boundsKeyMap.latitude;
                keyMap.longitude = boundsKeyMap.longitude;
            } else if(neonMapping === neonMappings.POINT) {
                var pointKeyMap = generatePointKeyMap(data[neonMappings.POINT][neonMappings.LATITUDE], data[neonMappings.POINT][neonMappings.LONGITUDE]);
                keyMap.latitude = pointKeyMap.latitude;
                keyMap.longitude = pointKeyMap.longitude;
            } else {
                var dataKeyMap = generateKeyMap(neonMapping, data[neonMapping] || "");
                keyMap[neonMapping] = dataKeyMap[neonMapping];
            }
        });

        var key = generateKeyFromKeyMap(keyMap);
        service.keysToKeyMaps[key] = keyMap;
        return key;
    };

    /**
     * Creates and returns the HTML for the sector header of the links popup showing the links for the given key.
     * @param {String} key
     * @method generateLinkHeader
     * @return {Object} or {String} A string key or an object created by angular's $sce.trustAsHtml().
     */
    service.generateLinkHeader = function(key) {
        var keyMap = service.keysToKeyMaps[key];
        if(Object.keys(keyMap).length) {
            var header = "<table>";
            Object.keys(keyMap).sort().forEach(function(mapping) {
                header += "<tr><td>" + mapping + ":</td><td>" + keyMap[mapping] + "</td></tr>";
            });
            return $sce.trustAsHtml(header + "</table>");
        }
        return key;
    };

    /**
     * Sorts the given list of keys based on the size of their key maps.
     * @param {Array} keys
     * @method sortKeys
     * @return {Array} The sorted list of keys.
     */
    service.sortKeys = function(keys) {
        keys.sort(function(keyA, keyB) {
            var keyMapSizeA = service.keysToKeyMaps[keyA] ? Object.keys(service.keysToKeyMaps[keyA]).length : 0;
            var keyMapSizeB = service.keysToKeyMaps[keyB] ? Object.keys(service.keysToKeyMaps[keyB]).length : 0;
            // Sort size descending.
            if(keyMapSizeA < keyMapSizeB) {
                return 1;
            }
            if(keyMapSizeA > keyMapSizeB) {
                return -1;
            }
            return 0;
        });
        return keys;
    };

    /**
     * The template for a link element that triggers the links popup used in the linksPopup and linksPopupButton directives.
     */
    service.ENABLED_TEMPLATE = "<a data-toggle='modal' data-target='.links-popup' data-links-json='{{json}}'" +
        "class='collapsed dropdown-toggle primary neon-popup-button' title='Open {{tooltip}} in another application...'>" +
        "<span class='glyphicon glyphicon-link'></span></a>";

    /**
     * The template for a disabled link element used in the linksPopup and linksPopupButton directives.
     */
    service.DISABLED_TEMPLATE = "<a class='disabled' title='No other applications available for {{tooltip}}' disabled>" +
        "<span class='glyphicon glyphicon-link'></span></a>";

    return service;
}]);
