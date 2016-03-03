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

angular.module('neonDemo.directives')
.directive('optionsMenu', ['ConnectionService', 'ErrorNotificationService', 'ExportService', 'config', function(connectionService, errorNotificationService, exportService, config) {
    return {
        templateUrl: 'components/optionsMenu/optionsMenu.html',
        restrict: 'EA',
        transclude: true,
        scope: {
            parentElement: '=',
            resizeMenu: '=?',
            buttonText: '=?',
            showButtonText: '=?',
            exportFunction: '=?'
        },
        link: function($scope, $element) {
            // Buffer needed above and below the chart options popover based on popover position, container padding (both set in the CSS), and UX.
            $scope.CHART_OPTIONS_BUFFER_Y = 65;

            $scope.showExport = config.showExport;
            $scope.optionsDisplayed = false;

            $scope.uniqueVisualizationOptions = 'chart-options-' + uuid();
            $element.find('.chart-options').addClass($scope.uniqueVisualizationOptions);

            $scope.toggleOptionsDisplay = function() {
                $scope.optionsDisplayed = !$scope.optionsDisplayed;
                var activity = ($scope.optionsDisplayed) ? 'show' : 'hide';
                XDATA.userALE.log({
                    activity: activity,
                    action: "click",
                    elementId: $scope.uniqueVisualizationOptions,
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["options"]
                });
            };

            $scope.getButtonText = function() {
                if($.isFunction($scope.buttonText)) {
                    return $scope.buttonText();
                }
                return $scope.buttonText;
            };

            var resizeButton = function() {
                var optionsButtonElement = $element.find(".chart-options .chart-options-button");
                // Subtract the width of the options menu icon and caret.
                var width = $scope.parentElement.width() - optionsButtonElement.find(".glyphicon").outerWidth(true) - optionsButtonElement.find(".caret").outerWidth(true) - 4;
                optionsButtonElement.find(".header-text").css("max-width", width + "px");
            };

            var resizeMenu = $scope.resizeMenu || function() {
                // Subtract the height of the options menu container and popover arrow.
                var height = $scope.parentElement.height() - $scope.parentElement.find(".options-container").outerHeight(true) - 10;
                $element.find(".chart-options .popover .popover-content").css("max-height", height + "px");
            };

            var resizeButtonAndMenu = function() {
                resizeButton();
                resizeMenu();
            };

            $scope.parentElement.resize(resizeButtonAndMenu);
            $element.find(".chart-options").resize(resizeButton);

            // Resize the options button and menu to reflect the initial size of the parent element.
            resizeButtonAndMenu();

            var exportSuccess = function(queryResults) {
                window.location.assign("/neon/services/exportservice/generateZip/" + queryResults.data);
            };

            var exportFail = function(response) {
                if(response.responseJSON) {
                    $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                }
            };

            $scope.requestExport = function() {
                if(!$scope.exportFunction) {
                    return;
                }
                var connection = connectionService.getActiveConnection();
                if(!connection) {
                    //This is temporary. Come up with better code for if there isn't a connection.
                    return;
                }
                var data = $scope.exportFunction();
                connection.executeExport(data, exportSuccess, exportFail, exportService.getFileFormat());
            };
        }
    };
}]);
