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

angular.module('neonDemo.controllers').controller('sunburstChartController', ['$scope', function($scope) {
    $scope.active.addField = {};
    $scope.active.arcValue = "count";
    $scope.active.groupFields = [];
    $scope.active.valueField = {};

    $scope.functions.onInit = function() {
        $scope.chart = new charts.SunburstChart($scope.functions.getElement()[0], '.sunburst-chart', {
            height: "100%",
            width: "100%"
        });
        $scope.chart.drawBlank();
    };

    $scope.functions.addToQuery = function(query) {
        if($scope.active.groupFields.length > 0) {
            query.groupBy.apply(query, $scope.active.groupFields);
        }

        query.aggregate(neon.query.COUNT, '*', 'count');
        if($scope.functions.isFieldValid($scope.active.valueField)) {
            query.aggregate(neon.query.SUM, $scope.active.valueField.columnName, $scope.active.valueField.prettyName);
        }

        return query;
    };

    $scope.functions.onUpdateFields = function() {
        $scope.active.groupFields = [];
        if($scope.bindings.groupFields) {
            _.each($scope.bindings.groupFields.split(","), function(groupFieldName) {
                var groupFieldObject = _.find($scope.fields, function(field) {
                    return field.columnName === groupFieldName;
                });
                if(groupFieldObject) {
                    $scope.active.groupFields.push(groupFieldObject);
                }
            });
        }

        $scope.active.valueField = $scope.functions.findFieldObject("valueField");
        $scope.active.arcValue = $scope.bindings.arcValue ? $scope.bindings.arcValue : charts.SunburstChart.COUNT_PARTITION;
    };

    var buildDataTree = function(data) {
        var nodes = {};
        var tree = {
            name: $scope.active.table.name,
            prettyName: $scope.active.table.name,
            key: $scope.active.table.name,
            children: []
        };

        data.forEach(function(item) {
            var parent = tree;
            var leafObject = {};
            var nodeKey = {};
            for(var i = 0; i < $scope.active.groupFields.length; i++) {
                var field = $scope.active.groupFields[i].columnName;
                var prettyField = $scope.active.groupFields[i].prettyName;

                leafObject[field] = item[field];
                nodeKey[field] = item[field];
                nodeKey.name = field + ": " + item[field];
                nodeKey.prettyName = (prettyField ? prettyField : field) + ": " + item[field];
                var nodeKeyString = JSON.stringify(nodeKey);

                if(!nodes[nodeKeyString]) {
                    if(i !== $scope.active.groupFields.length - 1) {
                        var nodeObject = {};
                        nodeObject.name = field + ": " + item[field];
                        nodeObject.prettyName = prettyField + ": " + item[field];
                        nodeObject.key = nodeKeyString;
                        nodeObject.children = [];
                        parent.children.push(nodeObject);
                        parent = nodeObject;
                        nodes[nodeKeyString] = nodeObject;
                    } else {
                        leafObject.name = field + ": " + item[field];
                        leafObject.prettyName = prettyField + ": " + item[field];
                        leafObject.count = item.count;
                        leafObject.total = item[$scope.active.valueField.prettyName];
                        leafObject.key = nodeKeyString;
                        parent.children.push(leafObject);
                    }
                } else {
                    parent = nodes[nodeKeyString];
                }
            }
        });

        return tree;
    };

    $scope.functions.updateData = function(data) {
        var tree = buildDataTree(data);
        $scope.chart.clearData();
        $scope.active.hasData = $scope.chart.drawData(tree);
    };

    $scope.showChart = function() {
        $scope.active.hasData = true;
    };

    $scope.handleChangeCountField = function() {
        $scope.functions.logChangeAndUpdateData("countField", $scope.active.valueField.columnName);
    };

    $scope.handleChangeArcValue = function() {
        $scope.chart.displayPartition($scope.active.arcValue);
    };

    $scope.handleAddGroup = function() {
        if($scope.active.groupFields.indexOf($scope.active.addField) === -1 && $scope.active.addField.columnName !== "") {
            $scope.active.groupFields.push($scope.active.addField);
            $scope.functions.logChangeAndUpdateData("groupFieldAdded", $scope.active.addField.columnName);
        }
        $scope.active.addField = {};
    };

    $scope.handleRemoveGroup = function(groupField) {
        var index = $scope.active.groupFields.indexOf(groupField);
        if(index >= 0) {
            $scope.active.groupFields.splice(index, 1);
            $scope.functions.logChangeAndUpdateData("groupFieldRemoved", groupField, "button");
        }
    };

    $scope.functions.hideHeaders = function() {
        return !($scope.active.groupFields.length > 0 || $scope.functions.isFieldValid($scope.active.valueField));
    };

    $scope.functions.createExportDataObject = function(exportId, query) {
        // Sort results by each group field so the resulting file won't be ugly.
        var sortByArgs = [];
        $scope.active.groupFields.forEach(function(field) {
            sortByArgs.push(field.prettyName);
            sortByArgs.push(neon.query.ASCENDING);
        });
        query.sortBy(sortByArgs);

        var finalObject = {
            name: "Sunburst",
            data: [{
                query: query,
                name: "sunburst-" + exportId,
                fields: [],
                ignoreFilters: query.ignoreFilters_,
                selectionOnly: query.selectionOnly_,
                ignoredFilterIds: query.ignoredFilterIds_,
                type: "query"
            }]
        };
        $scope.active.groupFields.forEach(function(field) {
            finalObject.data[0].fields.push({
                query: field.columnName,
                pretty: field.prettyName
            });
        });
        return finalObject;
    };

    $scope.functions.addToBindings = function(bindings) {
        bindings["bind-group-fields"] = $scope.active.groupFields.length ? "'" + _.map($scope.active.groupFields, function(field) {
            return field.columnName;
        }).join(",") + "'" : undefined;
        bindings["bind-value-field"] = ($scope.options.valueField && $scope.options.valueField.columnName) ? "'" + $scope.options.valueField.columnName + "'" : undefined;
        bindings["bind-arc-value"] = ($scope.active.arcValue) ? "'" + $scope.active.arcValue + "'" : undefined;
        return bindings;
    };
}]);
