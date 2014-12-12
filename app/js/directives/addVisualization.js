'use strict';
/*
 * Copyright 2014 Next Century Corporation
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
 * @class neonDemo.directives.addVisualization
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('addVisualization', ['$timeout', function($timeout) {
    return {
        templateUrl: 'partials/directives/addVisualization.html',
        restrict: 'EA',
        scope: {
            gridsterConfigs: "="
        },
        link: function($scope, $element) {
            $element.addClass('add-visualization');

            $scope.alertMessage = "";
            $scope.alertTimer = null;
            $scope.alertDelay = 2000;
            $scope.fadeTime = 500;

            /** Hold the default size, name, and directive settings for allowed visualizations. */
            $scope.visualizations = [{
                name: 'Timeline',
                sizeX: 6,
                sizeY: 1,
                type: 'timeline-selector',
                icon: 'img/visualizations/Timeline64.png'
            }, {
                name: 'Map',
                sizeX: 6,
                sizeY: 2,
                type: 'heat-map',
                icon: 'img/visualizations/Map64.png'
            }, {
                name: 'Linechart',
                sizeX: 2,
                sizeY: 2,
                type: 'linechart',
                icon: 'img/visualizations/LineChart64.png'
            }, {
                name: 'Barchart',
                sizeX: 2,
                sizeY: 2,
                type: 'barchart',
                icon: 'img/visualizations/BarChart64.png'
            }, {
                name: 'Ops Clock',
                sizeX: 2,
                sizeY: 2,
                type: 'circular-heat-form',
                icon: 'img/visualizations/OpsClock64.png'
            }, {
                name: 'Tag Cloud',
                sizeX: 6,
                sizeY: 1,
                type: 'tag-cloud',
                bindings: {
                    "tag-field": "'hashtags'"
                },
                icon: 'img/visualizations/TagCloud64.png'
            },{
                name: 'Count By',
                sizeX: 2,
                sizeY: 2,
                type: 'count-by',
                icon: 'img/Neon_60x34.png'
            }];

            /**
             * Returns the visualization types selected by the user in the dialog managed by this directive.
             * @returns Array{Object} Selected visualization configurations
             * @method getSelected
             * @private
             */
            function getSelected() {
                return _.filter($scope.visualizations, function(visualization) {
                    return visualization.selected === true;
                });
            }

            $scope.displayAlert = function(message) {
                // Cancel any existing alert timeouts.
                if ($scope.alertTimer) {
                    $timeout.cancel($scope.alertTimer);
                }

                // Set the new alert
                $scope.alertMessage = message;
                $element.find('.alert-success').fadeIn($scope.fadeTime);
                $scope.alertTimer = $timeout(function() {
                    $element.find('.alert-success').fadeOut($scope.fadeTime);
                }, $scope.alertDelay);
            };

            $scope.selectedItem = function(item, evt) {
                if ($scope.lastSelected) {
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
            };

            /**
             * Deselects all visualization configurations in the dialog managed byt his directive.
             * @method deselectAll
             * @private
             */
            $scope.deselectAll = function() {
                _.each($scope.visualizations, function(visualization) {
                    visualization.selected = false;
                });
            };
        }
    };
}]);
