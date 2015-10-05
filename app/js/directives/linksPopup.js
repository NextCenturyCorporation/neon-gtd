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
            $scope.cleanData = {};

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

            $scope.onOpen = function() {
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
            };

            // Add a handler to detect when the dialog is shown so we can log it.
            $(".links-popup").on("show.bs.modal", $scope.onOpen);
            $scope.$on('$destroy', function() {
                $(".links-popup").off("show.bs.modal", $scope.onOpen);
            });

            popups.links.setData = function(source, data) {
                var cleanData = [];
                data.forEach(function(links) {
                    var cleanLinks = [];
                    links.forEach(function(link) {
                        if(link.name && link.image && link.url) {
                            link.tab = link.tab || link.name;

                            if(link.image.charAt(0) === '/') {
                                link.image = '.' + link.image;
                            }

                            if(link.server) {
                                link.url = link.url.replace(popups.links.SERVER, link.server);
                            }

                            link.fields = link.fields || [];
                            link.fields.forEach(function(field) {
                                if(field.type === popups.links.URL) {
                                    link.url = link.url.replace(field.variable, field.substitute);
                                }
                            });

                            link.values = link.values || [];
                            link.values.forEach(function(value) {
                                if(value.type === popups.links.URL) {
                                    link.url = link.url.replace(value.variable, value.substitute);
                                }
                            });

                            // Notify angular that this is a trusted URL so angular will inject it into a form's action.
                            link.url = $sce.trustAsResourceUrl(link.url);

                            link.args = link.args || [];
                            link.args.forEach(function(arg) {
                                link.fields.forEach(function(field) {
                                    if(field.type === popups.links.HIDDEN) {
                                        arg.value = arg.value.replace(field.variable, field.substitute);
                                    }
                                });

                                link.values.forEach(function(value) {
                                    if(value.type === popups.links.HIDDEN) {
                                        arg.value = arg.value.replace(value.variable, value.substitute);
                                    }
                                });
                            });

                            cleanLinks.push(link);
                        }
                    });
                    cleanData.push(cleanLinks);
                });
                $scope.cleanData[source] = cleanData;
            };

            popups.links.setView = function(source, index) {
                if($scope.cleanData[source] && $scope.cleanData[source].length && index >= 0) {
                    $scope.links = $scope.cleanData[source][index];
                }
            };

            popups.links.deleteData = function(source) {
                if($scope.cleanData[source]) {
                    delete $scope.cleanData[source];
                }
            };

            popups.links.createLinkHtml = function(index, source) {
                return "<a data-toggle=\"modal\" data-target=\".links-popup\" data-links-index=\"" + index + "\" data-links-source=\"" + source + "\"" +
                    "class=\"collapsed dropdown-toggle primary neon-popup-button\"><span class=\"glyphicon glyphicon-link\"></span></a>";
            };

            popups.links.createDisabledLinkHtml = function() {
                return "<a class=\"disabled\" disabled><span class=\"glyphicon glyphicon-link\"></span></a>";
            };
        }
    };
}]);
