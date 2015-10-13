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
.directive('filterTray', function($timeout, FilterService) {
    return {
        templateUrl: 'partials/directives/filterTray.html',
        restrict: 'EA',
        scope: {
            boundParent: '=',
            includeParentHeight: '='
        },
        link: function($scope, el) {
            $scope.filterRemoveChannel = 'filter_tray.remove_filter';

            var init = function() {
                el.addClass('filterTrayDirective');

                if($scope.boundParent && el.parents($scope.boundParent).length > 0) {
                    $scope.container = $(el.parents($scope.boundParent)[0]);
                }

                $scope.messenger = new neon.eventing.Messenger();

                $scope.filters = {
                    raw: [],
                    formatted: []
                };

                $scope.messenger.events({
                    activeDatasetChanged: onDatasetChanged,
                    filtersChanged: onFiltersChanged
                });

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                });

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

            $scope.handleFilterRemove = function(filterIds) {
                $scope.messenger.publish(FilterService.REQUEST_REMOVE_FILTER, filterIds);
            };

            $scope.updateFilterTray = function(rawState) {
                $scope.filters.raw = rawState;
                var filters = formatFilters(rawState);
                $scope.$apply(function() {
                    $scope.filters.formatted = filters;
                });
            };

            var formatFilters = function(filters) {
                if(filters.length > 0) {
                    //We only want unique filter names to eliminate display of multiple filters created by filter service

                    //remove filters with empty string names
                    var filterList = _.filter(filters, function(filter) {
                        return (filter.filter.filterName && filter.filter.filterName !== '');
                    });

                    var result = {};
                    _.each(filterList, function(filter) {
                        if(result[filter.filter.filterName]) {
                            //add id to array
                            result[filter.filter.filterName].ids.push(filter.id);
                        } else {
                            result[filter.filter.filterName] = {
                                ids: [filter.id],
                                name: filter.filter.filterName
                            };
                        }
                    });

                    var resultList = [];
                    _.each(result, function(filter) {
                        resultList.push(filter);
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
