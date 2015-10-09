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
            $scope.links = [];

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

                // Set the link data for the links popup using the source and index from the triggering element.
                var element = $(event.relatedTarget);
                var source = element.data("links-source");
                var index = element.data("links-index");
                $scope.$apply(function() {
                    popups.links.setView(source, index);
                });
            };

            // Add a handler to detect when the dialog is shown so we can log it.
            $(".links-popup").on("show.bs.modal", $scope.onOpen);
            $scope.$on('$destroy', function() {
                $(".links-popup").off("show.bs.modal", $scope.onOpen);
            });

            /**
             * Cleans and returns the given list of links by replacing variables in the links with values as needed.
             * @param {Array} data
             * @method cleanData
             * @private
             * @return {Array}
             */
            var cleanData = function(data) {
                var cleanedData = [];
                data.forEach(function(links) {
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
                    cleanedData.push(cleanedLinks);
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
             * Sets the view of the links popup to the link data for the given source at the given index.
             * @param {String} source
             * @param {Number} index
             * @method setView
             */
            popups.links.setView = function(source, index) {
                if($scope.cleanedData[source] && $scope.cleanedData[source].length && index >= 0) {
                    $scope.links = $scope.cleanedData[source][index];
                }
            };

            /**
             * Adds the given links to the link data for the given source and returns the index at which the links were added.
             * @param {String} source
             * @param {Array} links
             * @method addLinks
             * @return {Number}
             */
            popups.links.addLinks = function(source, links) {
                $scope.cleanedData[source] = $scope.cleanedData[source] || [];
                var index = $scope.cleanedData[source].length;
                $scope.cleanedData[source].push(cleanData([links])[0]);
                return index;
            };

            /**
             * Removes the links in the link data for the given source at the given index, if it exists.
             * @param {String} source
             * @param {Number} index
             * @method removeLinksAtIndex
             */
            popups.links.removeLinksAtIndex = function(source, index) {
                if($scope.cleanedData[source] && $scope.cleanedData[source].length > index && index >= 0) {
                    $scope.cleanedData[source].splice(index, 1);
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
             * The template for a link element that triggers the links popup used in the linksPopup and linksPopupButton directives.
             */
            popups.links.ENABLED_TEMPLATE = "<a data-toggle='modal' data-target='.links-popup' data-links-index='{{index}}' data-links-source='{{source}}'" +
                "class='collapsed dropdown-toggle primary neon-popup-button' title='Open {{tooltip}} in another application...'>" +
                "<span class='glyphicon glyphicon-link'></span></a>";

            /**
             * The template for a disabled link element used in the linksPopup and linksPopupButton directives.
             */
            popups.links.DISABLED_TEMPLATE = "<a class='disabled' title='No other applications available for {{tooltip}}' disabled>" +
                "<span class='glyphicon glyphicon-link'></span></a>";

            /**
             * Creates and returns the HTML for a link using the given index, source, and tooltip.
             * @param {Number} index
             * @param {String} source
             * @param {String} tooltip
             * @method createLinkHtml
             * @return {String}
             */
            popups.links.createLinkHtml = function(index, source, tooltip) {
                return Mustache.render(popups.links.ENABLED_TEMPLATE, {
                    index: index,
                   source: source,
                   tooltip: tooltip
                });
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
        }
    };
}]);
