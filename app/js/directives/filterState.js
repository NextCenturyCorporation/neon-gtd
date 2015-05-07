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
angular.module('neonDemo.directives')
.directive('filterState', function() {
    return {
        templateUrl: 'partials/directives/filterState.html',
        restrict: 'EA',
        scope: {},
        link: function($scope, el) {
            var init = function() {
                el.addClass('filterStateDirective');

                $scope.messenger = new neon.eventing.Messenger();

                $scope.filterStates = {
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

                $scope.queryForState();
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
                /*if($scope.databaseName && $scope.tableName) {
                    queryForDBTableFilters($scope.updateFilterStateView, handleFilterStateError);
                }*/
                queryForFullState($scope.updateFilterStateView, handleFilterStateError);
            };

            var queryForFullState = function(success, failure) {
                neon.query.Filter.getFilterState('*', '*', success, failure);
            };

            var handleFilterStateError = function() {
                console.error(arguments);
            };

            $scope.updateFilterStateView = function(rawState) {
                $scope.filterStates.raw = rawState;
                var formattedStates = formatFilterState(rawState);
                $scope.filterStates.formatted = formattedStates;
            };

            var formatFilterState = function(rawStates) {
                if(rawStates.length > 0) {
                    var resultObj = {};

                    var filter;
                    var databaseName;
                    var tableName;

                    for(var i = 0; i < rawStates.length; i++) {
                        databaseName = rawStates[i].databaseName;
                        tableName = rawStates[i].tableName;
                        filter = parseFilter(rawStates[i].whereClause);

                        if(!resultObj[databaseName]) {
                            resultObj[databaseName] = {};
                        }
                        if(!resultObj[databaseName][tableName]) {
                            resultObj[databaseName][tableName] = [];
                        }

                        resultObj[databaseName][tableName].push(filter);
                    }

                    return resultObj;
                }
                return {};
            };

            var parseFilter = function(filterObject) {
                if(filterObject.type) {
                    if(filterObject.type === 'where') {
                        return ('( ' + filterObject.lhs + ' ' + filterObject.operator + ' ' + filterObject.rhs + ' )');
                    } else if(filterObject.type === 'and') {
                        return buildArrayFilterString(filterObject, 'AND');
                    } else if(filterObject.type === 'or') {
                        return buildArrayFilterString(filterObject, 'OR');
                    }
                } else {
                    console.error("Unknown type");
                    console.error(filterObject);
                }
            };

            var buildArrayFilterString = function(filterObject, type) {
                var res = '( ' + parseFilter(filterObject.whereClauses[0]);
                for(var i = 1; i < filterObject.whereClauses.length; i++) {
                    res = res + ' ' + type + ' ' + parseFilter(filterObject.whereClauses[i]);
                }
                res += ' )';
                return res;
            };

            neon.ready(function() {
                init();
            });
        }
    };
});
