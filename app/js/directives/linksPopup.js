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

angular.module('neonDemo.directives')
.directive('linksPopup', ['$sce', 'popups', function($sce, popups) {
    return {
        templateUrl: 'partials/directives/linksPopup.html',
        restrict: 'EA',
        scope: {
        },
        link: function($scope) {
            // Map that stores the array of cleaned link data for all the visualizations by a unique name.
            $scope.cleanedData = {};

            // The links currently displayed in the popup.
            $scope.links = {};

            $scope.linksCount = 0;

            $scope.logLinkEvent = function(name) {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "link-button-" + name,
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["external", "link"]
                });
            };

            $scope.onClose = function() {
                XDATA.userALE.log({
                    activity: "hide",
                    action: "click",
                    elementId: "link-dialog-close-button",
                    elementType: "dialog_box",
                    elementSub: "close-button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["external", "link"]
                });
            };

            $scope.onOpen = function(event) {
                XDATA.userALE.log({
                    activity: "show",
                    action: "click",
                    elementId: "link-dialog-open-button",
                    elementType: "dialog_box",
                    elementSub: "open-button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["external", "link"]
                });

                // Set the link data for the links popup using the source and key from the triggering button.
                var button = $(event.relatedTarget);
                var json = button.data("links-json");
                $scope.$apply(function() {
                    popups.links.setView(json || []);
                });
            };

            // Add a handler to detect when the dialog is shown so we can log it.
            $(".links-popup").on("show.bs.modal", $scope.onOpen);
            $scope.$on('$destroy', function() {
                $(".links-popup").off("show.bs.modal", $scope.onOpen);
            });

            /**
             * Cleans and returns the given collection of links by replacing variables in the links with values as needed.
             * @param {Object} data
             * @method cleanData
             * @private
             * @return {Object}
             */
            var cleanData = function(data) {
                var cleanedData = {};
                Object.keys(data).forEach(function(key) {
                    var links = data[key];
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
                    cleanedData[key] = cleanedLinks;
                });
                return cleanedData;
            };

            /**
             * Cleans the given link data and sets it as the links popup data for the given source.
             * @param {String} source
             * @param {Array} data
             * @method setData
             */
            popups.links.setData = function(source, data) {
                $scope.cleanedData[source] = cleanData(data);
            };

            /**
             * Sets the view of the links popup to the link data for the given sources at the given keys.
             * @param {Array} list A list of objects containing {String} source and {String} key
             * @method setView
             */
            popups.links.setView = function(list) {
                $scope.links = {};
                list.forEach(function(object) {
                    $scope.links[object.key] = ($scope.cleanedData[object.source] ? $scope.cleanedData[object.source][object.key] : []) || [];
                });
                $scope.linksCount = Object.keys($scope.links).length;
            };

            /**
             * Adds the given links to the link data for the given source and key.
             * @param {String} source
             * @param {String} key
             * @param {Array} links
             * @method addLinks
             */
            popups.links.addLinks = function(source, key, links) {
                $scope.cleanedData[source] = $scope.cleanedData[source] || {};
                var data = {};
                data[key] = links;
                $scope.cleanedData[source][key] = (cleanData(data))[key];
            };

            /**
             * Removes the links in the link data for the given source at the given key, if it exists.
             * @param {String} source
             * @param {String} key
             * @method removeLinksForKey
             */
            popups.links.removeLinksForKey = function(source, key) {
                if($scope.cleanedData[source] && $scope.cleanedData[source][key]) {
                    delete $scope.cleanedData[source][key];
                }
            };

            /**
             * Deletes the link data for the given source, if it exists.
             * @param {String} source
             * @method deleteData
             */
            popups.links.deleteData = function(source) {
                if($scope.cleanedData[source]) {
                    delete $scope.cleanedData[source];
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
            popups.links.createLinkHtml = function(source, key, tooltip) {
                return popups.links.createLinkHtmlFromList([{
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
            popups.links.createLinkHtmlFromList = function(list, tooltip) {
                return Mustache.render(popups.links.ENABLED_TEMPLATE, {
                    tooltip: tooltip,
                    json: popups.links.createButtonJsonFromList(list)
                });
            };

            /**
             * Creates and returns the JSON string for a button that opens the links popup using the given source and key.
             * @param {String} source
             * @param {String} key
             * @method createButtonJson
             * @return {String}
             */
            popups.links.createButtonJson = function(source, key) {
                return popups.links.createButtonJsonFromList([{
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
            popups.links.createButtonJsonFromList = function(list) {
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
            popups.links.createDisabledLinkHtml = function(tooltip) {
                return Mustache.render(popups.links.DISABLED_TEMPLATE, {
                    tooltip: tooltip
                });
            };

            /**
             * Creates and returns the service links for the given field and value using the given lists of external services and dataset mappings.
             * returns the number of links that were created.
             * @param {Array} services
             * @param {Array} mappings
             * @param {String} field
             * @param {Number} or {String} value
             * @method createAllServiceLinkObjects
             * @return {Array}
             */
            popups.links.createAllServiceLinkObjects = function(services, mappings, field, value) {
                var links = [];

                // For each mapping to the given field, if services exist for that mapping, create the links for the services.
                Object.keys(mappings).filter(function(mapping) {
                    return mappings[mapping] === field;
                }).forEach(function(mapping) {
                    if(services[mapping]) {
                        Object.keys(services[mapping].apps).forEach(function(app) {
                            links.push(popups.links.createServiceLinkObject(services[mapping], app, mapping, value));
                        });
                    }
                });

                return links;
            };

            /**
             * Creates and returns the service link object for the given app using the given service, mapping, and field value.
             * @param {Object} service
             * @param {String} app
             * @param {String} mapping
             * @param {Number} or {String} value
             * @method createServiceLinkObject
             * @return {Object}
             */
            popups.links.createServiceLinkObject = function(service, app, mapping, value) {
                var data = {};
                data[mapping] = value;
                return popups.links.createServiceLinkObjectWithData(service, app, data);
            };

            /**
             * Creates and returns the service link object for the given app using the given service and data collection of mappings to field values.
             * @param {Object} service
             * @param {String} app
             * @param {Object} data A list of objects containing {String} mapping and {Number} or {String} value
             * @method createServiceLinkObjectWithData
             * @return {Object}
             */
            popups.links.createServiceLinkObjectWithData = function(service, app, data) {
                return {
                    name: app,
                    image: service.apps[app].image,
                    url: service.apps[app].url,
                    args: service.args,
                    data: data
                };
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
            popups.links.generateBoundsKey = function(minLat, minLon, maxLat, maxLon) {
                return "Latitude " + minLat + " to " + maxLat + ", Longitude " + minLon + " to " + maxLon;
            };

            /**
             * Returns the key for a point with the given latitude and longitude values.
             * @param {Number} latitude
             * @param {Number} longitude
             * @method generatePointKey
             * @return {String}
             */
            popups.links.generatePointKey = function(latitude, longitude) {
                return "Latitude " + latitude + ", Longitude " + longitude;
            };

            /**
             * Returns the key for a range with the given start and end values.
             * @param {Number} or {String} start
             * @param {Number} or {String} end
             * @method generateRangeKey
             * @return {String}
             */
            popups.links.generateRangeKey = function(start, end) {
                return start + " to " + end;
            };

            /**
             * The template for a link element that triggers the links popup used in the linksPopup and linksPopupButton directives.
             */
            popups.links.ENABLED_TEMPLATE = "<a data-toggle='modal' data-target='.links-popup' data-links-json='{{json}}'" +
                "class='collapsed dropdown-toggle primary neon-popup-button' title='Open {{tooltip}} in another application...'>" +
                "<span class='glyphicon glyphicon-link'></span></a>";

            /**
             * The template for a disabled link element used in the linksPopup and linksPopupButton directives.
             */
            popups.links.DISABLED_TEMPLATE = "<a class='disabled' title='No other applications available for {{tooltip}}' disabled>" +
                "<span class='glyphicon glyphicon-link'></span></a>";
        }
    };
}]);
