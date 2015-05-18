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
            $scope.SERVER = "SERVER";
            $scope.FIELD = "FIELD";
            $scope.VALUE = "VALUE";

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
                for(var i = 0; i < data.length; ++i) {
                    var cleanLinks = [];
                    var links = data[i];
                    for(var j = 0; j < links.length; ++j) {
                        var link = links[j];
                        link.tab = link.data.query;
                        link.url = link.url.replace($scope.SERVER, link.data.server).replace($scope.VALUE, link.data.value);
                        // Notify angular that this is a trusted URL so angular will inject it into a form's action.
                        link.url = $sce.trustAsResourceUrl(link.url);
                        for(var k = 0; k < link.args.length; ++k) {
                            if(link.data.field) {
                                link.args[k].value = link.args[k].value.replace($scope.FIELD, link.data.field);
                            }
                            if(link.data.value) {
                                link.args[k].value = link.args[k].value.replace($scope.VALUE, link.data.value);
                            }
                        }
                        cleanLinks.push(link);
                    }
                    cleanData.push(cleanLinks);
                }
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
        }
    };
}]);
