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
 * This visualization shows a legend of data fields and values specified in the dashboard configuration file.
 * @namespace neonDemo.controllers
 * @class legendController
 * @constructor
 */
angular.module('neonDemo.controllers').controller('legendController', ['$scope', function($scope) {
    // Since objects are passed by reference, all legend visualizations will use the same legend objects to maintain their global filter state.
    $scope.legends = $scope.functions.getLegends();

    // The legend for the active database and table displayed in this visualization.
    $scope.active.legend = [];

    $scope.functions.onUpdateFields = function() {
        $scope.active.legend = $scope.legends[$scope.active.database.name] ? ($scope.legends[$scope.active.database.name][$scope.active.table.name] || []) : [];

        $scope.active.legend.forEach(function(group) {
            if(group.customized.field) {
                group.customized.fieldObject = _.find($scope.active.fields, function(field) {
                    return group.customized.field === field.columnName;
                });
                group.customized.value = "";
            }

            group.items.forEach(function(item) {
                item.fieldObject = _.find($scope.active.fields, function(field) {
                    return item.field === field.columnName;
                });
            });
        });
    };

    $scope.functions.executeQuery = function() {
        // The legend does not query the database.
        return undefined;
    };

    $scope.functions.isFilterSet = function() {
        return $scope.active.legend.some(function(group) {
            return group.items.some(function(item) {
                return item.on;
            });
        });
    };

    $scope.functions.getFilterFields = function() {
        // Called by checkDashboardNeonFilters (through findFilterData) in the visualizationSuperclass.  The legend visualization can set filters on any fields so return them all.
        // Will not be called by updateNeonFilter or removeNeonFilter because the legend visualization will give its own list of filter fields when those functions are invoked.
        return $scope.active.fields;
    };

    $scope.functions.createFilterTrayText = function(database, table, fields) {
        return fields.join(",");
    };

    $scope.functions.updateFilterValues = function(neonFilter) {
        var filters = {};
        var addFilter = function(whereClause) {
            filters[whereClause.lhs] = {
                operator: whereClause.operator,
                value: whereClause.rhs
            };
        };

        if($scope.functions.getNumberOfFilterClauses(neonFilter) === 1) {
            addFilter(neonFilter.filter.whereClause);
        } else {
            neonFilter.filter.whereClause.whereClauses.forEach(function(whereClause) {
                addFilter(whereClause);
            });
        }

        if(Object.keys(filters).length) {
            $scope.active.legend.forEach(function(group) {
                group.items.forEach(function(item) {
                    item.on = (filters[item.field] !== undefined && filters[item.field].operator === item.operator && filters[item.field].value === item.value);
                });
            });
        }
    };

    $scope.functions.removeFilterValues = function() {
        $scope.active.legend.forEach(function(group) {
            group.items.forEach(function(item) {
                item.on = false;
            });
        });
    };

    $scope.functions.createExportDataObject = function(exportId) {
        // The legend does not query the database so do not include any data queries.
        return {
            name: "Legend",
            data: []
        };
    };

    $scope.toggleFilterAndAddOrRemove = function(item) {
        // TODO Logging
        item.on = !item.on;
        $scope.addOrRemoveFilter(item.fieldObject);
    };

    $scope.addOrRemoveFilter = function(fieldObject) {
        var filterDataForField = $scope.getFilterData().filter(function(data) {
            return data.fieldObject.columnName === fieldObject.columnName;
        });
        if(filterDataForField.length) {
            $scope.functions.updateNeonFilter({
                fields: [fieldObject],
                createNeonFilterClause: function(databaseAndTableName, fieldName) {
                    var filterClauses = filterDataForField.map(function(data) {
                        return neon.query.where(fieldName, data.operator, data.value);
                    });
                    return filterClauses.length > 1 ? neon.query.and.apply(neon.query, filterClauses) : filterClauses[0];
                }
            });
        } else {
            $scope.functions.removeNeonFilter({
                fields: [fieldObject]
            });
        }
    };

    $scope.addCustomizedFilter = function(group) {
        // TODO Logging
        if(group.customized.value) {
            group.items.push({
                label: group.customized.value,
                field: group.customized.field,
                fieldObject: group.customized.fieldObject,
                operator: group.customized.operator,
                value: group.customized.value,
                on: true
            });
            group.customized.value = "";
            $scope.addOrRemoveFilter(group.customized.fieldObject);
        }
    };

    $scope.getFilterData = function() {
        // Legend items for display in the filter notification directive.
        var data = [];
        $scope.active.legend.forEach(function(group) {
            group.items.forEach(function(item) {
                if(item.on) {
                    data.push(item);
                }
            });
        });
        return data;
    };

    $scope.getFilterDesc = function(item) {
        return item.field + " " + item.operator + " " + item.value;
    };

    $scope.getFilterText = function(item) {
        return item.label;
    };
}]);
