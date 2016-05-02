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

        $scope.active.legend.forEach(function(item) {
            item.fieldObject = _.find($scope.active.fields, function(field) {
                return item.field === field.columnName;
            });
            item.types.forEach(function(type) {
                type.fieldObject = _.find($scope.active.fields, function(field) {
                    return item.field + "." + type.field === field.columnName;
                });
            });
        });
    };

    $scope.functions.executeQuery = function() {
        // The legend does not query the database.
        return undefined;
    };

    $scope.functions.isFilterSet = function() {
        return $scope.active.legend.some(function(item) {
            return item.on || item.types.some(function(type) {
                return type.on;
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
            $scope.active.legend.forEach(function(item) {
                item.on = (filters[item.field] !== undefined);
                item.types.forEach(function(type) {
                    type.on = (filters[item.field + "." + type.field] !== undefined && filters[item.field + "." + type.field].operator === type.operator &&
                        filters[item.field + "." + type.field].value === type.value);
                });
            });
        }
    };

    $scope.functions.removeFilterValues = function() {
        $scope.active.legend.forEach(function(item) {
            item.on = false;
            item.types.forEach(function(type) {
                type.on = false;
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

    $scope.addOrRemoveFilter = function(itemOrType) {
        // TODO Logging
        itemOrType.on = !itemOrType.on;
        if(itemOrType.on) {
            $scope.functions.updateNeonFilter({
                fields: [itemOrType.fieldObject],
                createNeonFilterClause: function(databaseAndTableName, fieldName) {
                    return neon.query.where(fieldName, itemOrType.operator, itemOrType.value);
                }
            });
        } else {
            $scope.functions.removeNeonFilter({
                fields: [itemOrType.fieldObject]
            });
        }
    };

    $scope.getFilterData = function() {
        // Legend items and types for display in the filter notification directive.
        var data = [];
        $scope.active.legend.forEach(function(item) {
            if(item.on) {
                data.push(item);
            }
            item.types.forEach(function(type) {
                if(type.on) {
                    data.push(type);
                }
            });
        });
        return data;
    };

    $scope.getFilterText = function(itemOrType) {
        return itemOrType.label;
    };
}]);
