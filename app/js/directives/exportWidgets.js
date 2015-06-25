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

/**
 * This Angular JS directive adds a simple button to a page that uses the exportService to export every widget on the page a group.
 *
 * @namespace neonDemo.directives
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('exportWidgets', ['ConnectionService', 'ErrorNotificationService', 'ExportService',
    function(connectionService, errorNotificationService, exportService) {
    return {
        templateUrl: 'partials/directives/exportWidgets.html',
        restrict: 'EA',
        link: function($scope) {
            var exportSuccess = function(queryResults) {
                window.location.assign("/neon/services/exportservice/generateZip/" + queryResults.data);
            };

            var exportFail = function(response) {
                if(response.responseJSON) {
                    $scope.errorMessage = errorNotificationService.showErrorMessage(undefined, response.responseJSON.error, response.responseJSON.stackTrace);
                }
            };

            $scope.exportAll = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "export-all-button",
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["export"]
                });
                var connection = connectionService.getActiveConnection();
                if(!connection) {
                    //This is temporary. Come up with better code for if there isn't a connection.
                    return;
                }
                var data = {
                    // TODO Change this hardcoded value to something like a user ID.
                    name: "All_Widgets",
                    data: []
                };
                exportService.getWidgets().forEach(function(widget) {
                    var widgetObject = widget.callback();
                    for(var x = 0; x < widgetObject.data.length; x++) {
                        data.data.push(widgetObject.data[x]);
                    }
                });
                connection.executeExport(data, exportSuccess, exportFail, exportService.getFileFormat());
            };
        }
    };
}]);