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
 * This Angualr JS directive creates a D3JS timeline chart that includes a brushing tool to facilitate the selection of
 * of data based on a date range.
 *
 * @example
 *    &lt;timeline-selector-chart cell-values="data"&gt;&lt;/timeline-selector&gt;<br>
 *    &lt;div timeline-selector-chart cell-values="data"&gt;&lt;/div&gt;
 *
 * @see neonDemo.charts.timelineSelectorChart
 * @namespace neonDemo.directives
 * @class timelineSelectorChart
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('timelineSelectorChart', ['$timeout', function($timeout) {
    return {
        restrict: 'EA',
        scope: {
            timelineElement: '=',
            timelineData: '=',
            timelineBrush: '=',
            extentDirty: '=',
            collapsed: '=',
            primarySeries: '=',
            granularity: '=',
            queryError: '=',
            showFocus: '='
        },
        link: function($scope, $element) {
            // Initialize the chart.
            $scope.chart = new charts.TimelineSelectorChart($element[0]);

            // Add a brush handler.
            $scope.chart.addBrushHandler(function(data) {
                // Wrap our data change in $apply since this is fired from a D3 event and outside of
                // angular's digest cycle.
                $scope.$apply(function() {
                    XDATA.userALE.log({
                        activity: "select",
                        action: "click",
                        elementId: "timeline-range",
                        elementType: "canvas",
                        elementSub: "date-range",
                        elementGroup: "chart_group",
                        source: "user",
                        tags: ["timeline", "date-range", "filter"]
                    });

                    $scope.timelineBrush = data;

                    if($scope.showFocus === "on_filter") {
                        $scope.chart.toggleFocus(true);
                    }
                });
            });

            // Render an initial empty view.
            $scope.chart.render([]);

            var redrawOnResize = function() {
                // Start at 25 to add extra padding to chart
                var headerHeight = 25;

                $scope.timelineElement.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });

                $scope.timelineElement.find(".mmpp").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });

                $scope.chart.config.height = $scope.timelineElement.height() - headerHeight;
                $scope.chart.config.width = $scope.timelineElement.outerWidth(true);

                if($scope.showFocus === "always" || ($scope.showFocus === "on_filter" && $scope.timelineBrush.length > 0)) {
                    $scope.chart.toggleFocus(true);
                } else {
                    $scope.chart.toggleFocus(false);
                }

                $scope.resizePromise = null;
            };

            // Watch for changes in the element size and update us.
            $scope.$watch(
                function() {
                    return $scope.timelineElement.outerWidth(true) + "x" + $scope.timelineElement.outerHeight(true);
                },
                function(newVal) {
                    if(newVal && $scope.chart) {
                        if(!$scope.resizePromise) {
                            $scope.resizePromise = $timeout(redrawOnResize, 500);
                        }
                    }
                });

            // If our data updates, reset our internal value fields and render the new view
            // and clear the brush.
            $scope.$watch('timelineData', function(newVal) {
                if(newVal && (newVal.length > 0)) {
                    $scope.chart.updateGranularity($scope.granularity);
                    $scope.chart.render(newVal);
                    $scope.chart.renderExtent($scope.timelineBrush);
                }
            }, true);

            $scope.$watch('timelineBrush', function(newVal) {
                if(newVal && newVal.length === 0) {
                    $scope.chart.clearBrush();

                    if($scope.showFocus === "on_filter") {
                        $scope.chart.toggleFocus(false);
                    }
                } else if(newVal) {
                    if($scope.showFocus === "on_filter") {
                        $scope.chart.toggleFocus(true);
                    }
                }
            });

            $scope.$watch("queryError", function() {
                if(!$scope.queryError && $scope.chart) {
                    $scope.chart.hideErrorbars();
                }
            });

            $scope.$watch('extentDirty', function(newVal) {
                if(newVal) {
                    $scope.extentDirty = false;
                    $scope.chart.renderExtent($scope.timelineBrush);
                }
            });

            $scope.$watch('collapsed', function(newVal) {
                if(newVal !== undefined) {
                    $scope.chart.collapse(newVal);
                }
            });

            $scope.$watch('primarySeries', function(newVal) {
                if(newVal) {
                    $scope.chart.updatePrimarySeries(newVal);
                    $scope.chart.render($scope.timelineData);
                    $scope.chart.renderExtent($scope.timelineBrush);
                }
            });

            $scope.$watch('showFocus', function(newVal) {
                if(newVal === 'always') {
                    $scope.chart.toggleFocus(true);
                } else if(newVal === 'never') {
                    $scope.chart.toggleFocus(false);
                } else if(newVal === 'on_filter' && $scope.timelineBrush.length > 0) {
                    $scope.chart.toggleFocus(true);
                }
            });

            /**
             * Event handler for date selected events issued over Neon's messaging channels.
             * @param {Object} message A Neon date selected message.
             * @method onDateSelected
             * @private
             */
            var onDateSelected = function(message) {
                if(message.start && message.end) {
                    $scope.chart.selectDate(message.start, message.end);
                } else {
                    $scope.chart.deselectDate();
                }
            };

            var onHover = function(startDate, endDate) {
                $scope.$apply(function() {
                    $scope.messenger.publish('date_selected', {
                        start: startDate,
                        end: endDate
                    });
                });
            };

            var initialize = function() {
                $scope.messenger = new neon.eventing.Messenger();
                $scope.messenger.subscribe("date_selected", onDateSelected);
                $scope.chart.setHoverListener(onHover);
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                initialize();
            });
        }
    };
}]);
