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
.directive('filterTray', function($timeout) {
    return {
        templateUrl: 'partials/directives/filterTray.html',
        restrict: 'EA',
        scope: {
            boundParent: '=',
            updateParentHeight: '='
        },
        link: function($scope, el) {
            var init = function() {
                el.addClass('filterTrayDirective');

                if($scope.boundParent && el.parents($scope.boundParent).length > 0) {
                    $scope.container = $(el.parents($scope.boundParent)[0]);
                }

                $scope.messenger = new neon.eventing.Messenger();

                $scope.filters = {
                    raw: [],
                    formatted: {}
                };

                $scope.messenger.events({
                    activeDatasetChanged: onDatasetChanged,
                    filtersChanged: onFiltersChanged
                });

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                });

                $scope.$watch('filters.formatted', function() {
                    $timeout(updateContainerHeight, 0);
                }, true);

                //FIXME needs promise with timeout to not fire a bunch of times
                //$(window).resize(updateContainerHeight);
            };

            var onDatasetChanged = function(message) {
                $scope.databaseName = message.database;
                $scope.tableName = message.table;
                $scope.queryForState();
            };

            var onFiltersChanged = function() {
                $scope.queryForState();
            };

            $scope.queryForState = function() {
                queryForFullState($scope.updateFilterTray, handleFilterStateError);
            };

            var queryForFullState = function(success, failure) {
                neon.query.Filter.getFilterState('*', '*', success, failure);
            };

            var handleFilterStateError = function() {
                console.error(arguments);
            };

            $scope.updateFilterTray = function(rawState) {
                $scope.filters.raw = rawState;
                var filters = formatFilters(rawState);
                $scope.$apply(function() {
                    $scope.filters.formatted = filters;
                });
            };

            //calculate normal height of navbar (min-height) and add the size of the filter tray.
            var updateContainerHeight = function() {
                var height = $(el).parent().height();
                var minHeight = parseInt($scope.container.css("min-height"), 10);
                var newHeight = minHeight + height;
                $scope.container.height(newHeight);
            };

            //Drop duplicate names.
            var formatFilters = function(filters) {
                if(filters.length > 0) {
                    //We only want unique filter names to eliminate multiple filters created by filter service
                    var uniqueNameList = _.uniq(filters, false, function(filter) {
                        return filter.filterName;
                    });

                    var resultList = _.map(uniqueNameList, function(uniqueName) {
                        return uniqueName.filterName;
                    });
                    return resultList;
                }
                return [];
            };

            neon.ready(function() {
                init();
            });
        }
    };
});
