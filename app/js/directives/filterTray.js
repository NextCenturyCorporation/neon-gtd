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
.directive('filterTray', ['$timeout', 'external', 'DatasetService', 'FilterService', 'LinksPopupService',
function($timeout, external, datasetService, filterService, linksPopupService) {
    return {
        templateUrl: 'partials/directives/filterTray.html',
        restrict: 'EA',
        scope: {
            boundParent: '=',
            includeParentHeight: '='
        },
        link: function($scope, $element) {
            $scope.filterRemoveChannel = 'filter_tray.remove_filter';
            $scope.filterTrayId = "filter-tray-" + uuid();
            $scope.showLinksPopupButton = false;

            var init = function() {
                $element.addClass('filterTrayDirective');

                if($scope.boundParent && $element.parents($scope.boundParent).length > 0) {
                    $scope.container = $($element.parents($scope.boundParent)[0]);
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
                    $scope.messenger.unsubscribeAll();
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
                $scope.messenger.publish(filterService.REQUEST_REMOVE_FILTER, filterIds);
            };

            $scope.updateFilterTray = function(rawState) {
                $scope.filters.raw = rawState;
                var filters = formatFilters(rawState);
                $scope.$apply(function() {
                    $scope.filters.formatted = filters;
                    findServicesMappingsAndDataInFilterState(rawState);
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

            /**
             * Finds the mappings and data for the available external services that can be called for the given filter state, creates the link objects for the
             * services, and saves them with the data for the links popup.
             * @param {Object} filterState
             * @method findServicesMappingsAndDataInFilterState
             * @private
             */
            var findServicesMappingsAndDataInFilterState = function(filterState) {
                var singleServiceMappingsToData = {};
                filterState.forEach(function(item) {
                    var servicesMappingsToDataForItem = findServicesMappingsAndDataInFilter(item.filter);
                    Object.keys(servicesMappingsToDataForItem).forEach(function(mapping) {
                        singleServiceMappingsToData[mapping] = servicesMappingsToDataForItem[mapping];
                    });
                });

                var multipleServicesMappingsToData = {};
                findCombinations(Object.keys(singleServiceMappingsToData), [], []).forEach(function(singleServiceMappingsList) {
                    var multipleServicesMapping = singleServiceMappingsList.sort().join(",");
                    multipleServicesMappingsToData[multipleServicesMapping] = {};
                    singleServiceMappingsList.forEach(function(singleServiceMapping) {
                        var mappingData = singleServiceMappingsToData[singleServiceMapping];
                        if(_.isString(mappingData)) {
                            multipleServicesMappingsToData[multipleServicesMapping][singleServiceMapping] = mappingData;
                        } else {
                            multipleServicesMappingsToData[multipleServicesMapping][singleServiceMapping] = {};
                            Object.keys(mappingData).forEach(function(key) {
                                multipleServicesMappingsToData[multipleServicesMapping][singleServiceMapping][key] = mappingData[key];
                            });
                        }
                    });
                });

                var allLinks = {};
                $scope.showLinksPopupButton = false;
                Object.keys(multipleServicesMappingsToData).forEach(function(multipleServicesMapping) {
                    if(external.services[multipleServicesMapping]) {
                        var mappingData = multipleServicesMappingsToData[multipleServicesMapping];
                        var links = [];
                        Object.keys(external.services[multipleServicesMapping].apps).forEach(function(app) {
                            links.push(linksPopupService.createServiceLinkObjectWithData(external.services[multipleServicesMapping], app, mappingData));
                        });
                        var key = linksPopupService.generateMultipleServicesKey(multipleServicesMapping, mappingData);
                        allLinks[key] = links;
                        $scope.showLinksPopupButton = $scope.showLinksPopupButton || links.length;
                    }
                });

                linksPopupService.setLinks($scope.filterTrayId, allLinks);
                $element.find("#linksPopupButton").data("links-json", createLinksPopupButtonJson(Object.keys(allLinks)));
            };

            /**
             * Finds and returns the mappings and data for the available external services that can be called for the where clauses in the given filter.
             * @param {Object} filter
             * @method findServicesMappingsAndDataInFilter
             * @private
             * @return {Object}
             */
            var findServicesMappingsAndDataInFilter = function(filter) {
                var servicesMappingsToData = {};
                var filterData = findFieldsAndValuesInWhereClause(filter.whereClause, []);

                var dateField = datasetService.getMapping(filter.databaseName, filter.tableName, neonMappings.DATE);
                if(filterData.length === 2 && filterData[0].field === dateField && filterData[1].field === dateField) {
                    servicesMappingsToData[neonMappings.DATE] = {
                        startDate: filterData[0].value,
                        endDate: filterData[1].value
                    };
                    return servicesMappingsToData;
                }

                var latField = datasetService.getMapping(filter.databaseName, filter.tableName, neonMappings.LATITUDE);
                var lonField = datasetService.getMapping(filter.databaseName, filter.tableName, neonMappings.LONGITUDE);
                if(filterData.length === 4 && filterData[0].field === lonField && filterData[1].field === lonField && filterData[2].field === latField && filterData[3].field === latField) {
                    servicesMappingsToData[neonMappings.BOUNDS] = {
                        minLon: filterData[0].value,
                        maxLon: filterData[1].value,
                        minLat: filterData[2].value,
                        maxLat: filterData[3].value
                    };
                    return servicesMappingsToData;
                }

                var mappings = datasetService.getMappings(filter.databaseName, filter.tableName);
                filterData.forEach(function(item) {
                    Object.keys(mappings).forEach(function(mapping) {
                        if(external.services[mapping] && item.field === mappings[mapping]) {
                            servicesMappingsToData[mapping] = item.value;
                        }
                    });
                });

                return servicesMappingsToData;
            };

            /**
             * Finds the fields and values in the given where clause, adds them to the given filter data, and returns the filter data.
             * @param {Object} whereClause A where clause containing either {String} lhs and {String} rhs or {Array} whereClauses containing other where clause Objects.
             * @param {Object} filterData
             * @method findFieldsAndValuesInWhereClause
             * @private
             * @return {Object}
             */
            var findFieldsAndValuesInWhereClause = function(whereClause, filterData) {
                if(whereClause.whereClauses) {
                    for(var i = 0; i < whereClause.whereClauses.length; ++i) {
                        filterData = findFieldsAndValuesInWhereClause(whereClause.whereClauses[i], filterData);
                    }
                } else if(whereClause.lhs && whereClause.rhs) {
                    filterData.push({
                        field: whereClause.lhs,
                        operator: whereClause.operator,
                        value: whereClause.rhs
                    });
                }
                return filterData;
            };

            /**
             * Finds all multiple item combinations of the given list of items concatenated to the given current list, saves them in the given list of results,
             * and returns the results.
             * @param {Array} items
             * @param {Array} current
             * @param {Array} results
             * @method findCombinations
             * @private
             * @return {Array}
             */
            var findCombinations = function(items, current, results) {
                if(!current.length && !items.length) {
                    return [];
                }
                if(!items.length) {
                    // Ignore single items.
                    if(current.length > 1) {
                        results.push(angular.copy(current));
                    }
                } else {
                    findCombinations(items.slice(1), current.concat([items[0]]), results);
                    findCombinations(items.slice(1), current, results);
                }
                return results;
            };

            /**
             * Creates and returns the JSON string for the links popup button using the given keys for the links popup data.
             * @param {Array} keys
             * @method createLinksPopupButtonJson
             * @private
             * @return {String}
             */
            var createLinksPopupButtonJson = function(keys) {
                var list = [];
                keys.forEach(function(key) {
                    list.push({
                        source: $scope.filterTrayId,
                        key: key
                        //key: linksPopupService.generateKey($scope.options.headField, head)
                    });
                });
                return linksPopupService.createButtonJsonFromList(list);
            };

            neon.ready(function() {
                init();
            });
        }
    };
}]);
