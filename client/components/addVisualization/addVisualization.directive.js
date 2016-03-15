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

/**
 * This directive will add a button suitable for application nav bars that
 * will open a visualization selector dialog when pressed.  The dialog allows a user
 * to select a number of visualization types and will add Angular Gridster configuration
 * elements for them to an array of configuration items.  The array of active items
 * can be provide via a two-way binding.
 *
 * @namespace neonDemo.directives
 * @class addVisualization
 * @constructor
 */
angular.module('neonDemo.directives').directive('addVisualization', ['$timeout', 'visualizations', function($timeout, visualizations) {
    return {
        templateUrl: 'components/addVisualization/addVisualization.html',
        restrict: 'EA',
        scope: {
            gridsterConfigs: "="
        },
        link: function($scope, $element) {
            $element.addClass('add-visualization');

            $scope.dialogDisplayed = false;
            $scope.visualizations = visualizations;
            $scope.alertMessage = "";
            $scope.alertTimer = null;
            $scope.alertDelay = 4000;
            $scope.fadeTime = 500;

            /**
             * Displays a simple "added" alert to the user when they have added a new visualization.
             * The alert will disappear after a few seconds.
             * @method displayAlert
             */
            $scope.displayAlert = function(message) {
                // Cancel any existing alert timeouts.
                if($scope.alertTimer) {
                    $timeout.cancel($scope.alertTimer);
                }

                // Set the new alert
                $scope.alertMessage = message;
                $element.find('.alert-success').fadeIn($scope.fadeTime);
                $scope.alertTimer = $timeout(function() {
                    $element.find('.alert-success').fadeOut($scope.fadeTime);
                }, $scope.alertDelay);
            };

            /**
             * A selection handler that adds new visualizations when a type is selected by the user.
             * @method onItemSelected
             */
            $scope.onItemSelected = function(item) {
                if($scope.lastSelected) {
                    $scope.lastSelected.selected = false;
                }
                item.selected = true;
                $scope.lastSelected = item;
                $scope.addVisualization(item);
            };

            /**
             * Adds one instance of each user-selected visualization type to the gridsterConfigs provided as
             * a binding to this directive instance.
             * @param {Object} visualziation a visualization configuration;
             * @param {String} visualization.name The name to display in the visualization list.
             * @param {Number} visualization.sizeX The number of columns to take up in a gridster layout.
             * @param {Number} visualization.sizeY The number of rows to take up in a gridster layout.
             * @param {String} visualization.type The name of the visualization directive to use in a gridster layout.
             * @param {Object} visualization.bindings An object mapping variable names to use for directive bindings.
             * @param {String} visualization.icon A URL for an icon representing this visualization type.
             * @method addVisualization
             */
            $scope.addVisualization = function(visualization) {
                // Clone the items.  Note that underscore's clone is shallow, so also
                // clone the default bindings explicitly.
                var newVis = _.clone(visualization);
                newVis.bindings = _.clone(visualization.bindings);
                newVis.id = uuid();
                $scope.gridsterConfigs.push(newVis);

                $scope.displayAlert(visualization.name + " added!");
                XDATA.userALE.log({
                    activity: "add",
                    action: "click",
                    elementId: "add-" + visualization.name + "-button",
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["add visualization", visualization.name]
                });
            };

            /**
             * Deselects all visualization configurations in the dialog managed by this directive.
             * @method deselectAll
             * @private
             */
            $scope.deselectAll = function() {
                _.each($scope.visualizations, function(visualization) {
                    visualization.selected = false;
                });
            };

            $scope.onClose = function() {
                $scope.dialogDisplayed = false;

                XDATA.userALE.log({
                    activity: "hide",
                    action: "click",
                    elementId: "add-visualization-dialog-close-button",
                    elementType: "dialog_box",
                    elementSub: "close-button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["external", "link"]
                });
                $scope.deselectAll();
            };

            $scope.toggleAddVisualizationDialog = function() {
                $scope.dialogDisplayed = !$scope.dialogDisplayed;

                XDATA.userALE.log({
                    activity: ($scope.dialogDisplayed) ? "show" : "hide",
                    action: "click",
                    elementId: "add-visualization-dialog-open-button",
                    elementType: "dialog_box",
                    elementSub: "open-button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["external", "link"]
                });
            };
        }
    };
}]);
