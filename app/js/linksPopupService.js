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

                        Object.keys(link.data).forEach(function(dataMapping) {
                            if(_.isString(argsMappings)) {
                                argsMappings = (argsMappings === dataMapping ? link.data[dataMapping] : argsMappings);
                            } else {
                                Object.keys(argsMappings).forEach(function(argMapping) {
                                    argsMappings[argMapping] = (argsMappings[argMapping] === dataMapping ? link.data[dataMapping] : argsMappings[argMapping]);
                                });
                            }
                        });

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
     * Returns the key for bounds with the given minimum and maximum latitude and longitude values.
     * @param {Number} minLat
     * @param {Number} minLon
     * @param {Number} maxLat
     * @param {Number} maxLon
     * @method generateBoundsKey
     * @return {String}
     */
    service.generateBoundsKey = function(minLat, minLon, maxLat, maxLon) {
        return "Latitude " + minLat + " to " + maxLat + ", Longitude " + minLon + " to " + maxLon;
    };

    /**
     * Returns the key for a point with the given latitude and longitude values.
     * @param {Number} latitude
     * @param {Number} longitude
     * @method generatePointKey
     * @return {String}
     */
    service.generatePointKey = function(latitude, longitude) {
        return "Latitude " + latitude + ", Longitude " + longitude;
    };

    /**
     * Returns the key for a range with the given start and end values.
     * @param {Number} or {String} start
     * @param {Number} or {String} end
     * @method generateRangeKey
     * @return {String}
     */
    service.generateRangeKey = function(start, end) {
        return start + " to " + end;
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
