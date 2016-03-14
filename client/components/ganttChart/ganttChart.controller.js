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
 * This visualization shows time data in a gantt chart.
 * @namespace neonDemo.controllers
 * @class ganttChartController
 * @constructor
 */
angular.module('neonDemo.controllers').controller('ganttChartController', ['$scope', function($scope) {
    $scope.active.legend = [];
    $scope.active.startField = {};
    $scope.active.endField = {};
    $scope.active.colorField = {};
    $scope.active.titleField = {};
    $scope.active.newGroupField = {};
    $scope.active.groupFields = [];
    $scope.active.selectableGroups = [];
    $scope.active.selectedGroups = [];
    $scope.active.selectedGroup = "";

    $scope.registerHooks = function(ganttApi) {
        ganttApi.directives.on.new($scope, function(dName, dScope, dElement) {
            if(dName === "ganttTaskContent") {
                dElement.attr('data-id', dScope.task.model.id);
                dElement.bind('click', function(event) {
                    var clickedElement = $(event.currentTarget);
                    addFilterForId(clickedElement.attr('data-id'));
                });
            }
        });
    };

    var addFilterForId = function(id) {
        $scope.filter = id;
        $scope.functions.updateNeonFilter();
    };

    $scope.removeFilter = function() {
        $scope.functions.removeNeonFilter();
    };

    $scope.functions.updateFilterValues = function(neonFilter) {
        if($scope.functions.getNumberOfFilterClauses() === 1) {
            $scope.filter = neonFilter.filter.whereClause.rhs;
        }
    };

    $scope.functions.onUpdateFields = function() {
        $scope.active.startField = $scope.functions.findFieldObject("startField");
        $scope.active.endField = $scope.functions.findFieldObject("endField");
        $scope.active.colorField = $scope.functions.findFieldObject("colorField");
        $scope.active.titleField = $scope.functions.findFieldObject("titleField");

        $scope.active.groupFields = [];
        if($scope.bindings.groupFields) {
            var groupFieldNames = $scope.bindings.groupFields.split(",");
            groupFieldNames.forEach(function(groupFieldName) {
                var groupFieldObject = _.find($scope.active.fields, function(field) {
                    return field.columnName === groupFieldName;
                });
                if(groupFieldObject) {
                    $scope.active.groupFields.push(groupFieldObject);
                }
            });
        }

        $scope.active.selectableGroups = [];
        $scope.active.selectedGroups = $scope.bindings.selectedGroups ? $scope.bindings.selectedGroups.split(",") : [];
    };

    var queryForSelectedGroups = function() {
        if($scope.active.groupFields.length && $scope.functions.isFieldValid($scope.active.groupFields[0])) {
            $scope.functions.queryAndUpdate({
                addToQuery: addToSelectedGroupsQuery,
                updateData: updateSelectedGroups
            });
        } else {
            // Run the query for the gantt chart data and update the gantt chart.
            $scope.functions.queryAndUpdate();
        }
    };

    var addToSelectedGroupsQuery = function(query) {
        query.groupBy($scope.active.groupFields[0]).aggregate(neon.query.COUNT, "*", "count").sortBy("count", neon.query.DESCENDING);
        if($scope.filter) {
            var filterClause = $scope.functions.createNeonFilterClause({
                database: $scope.active.database.name,
                table: $scope.active.table.name
            }, "_id");
            query.ignoreFilters([$scope.functions.getFilterKey(filterClause)]);
        }
        return query;
    };

    var updateSelectedGroups = function(data) {
        if(!data) {
            $scope.active.selectableGroups = [];
            $scope.functions.updateData([]);
        } else {
            $scope.active.selectableGroups = data.map(function(item) {
                return neon.helpers.getNestedValue(item, $scope.active.groupFields[0].columnName);
            }) || [];
            // Run the query for the gantt chart data and update the gantt chart.
            $scope.functions.queryAndUpdate();
        }
    };

    $scope.functions.isFilterSet = function() {
        return $scope.filter;
    };

    $scope.functions.areDataFieldsValid = function() {
        return $scope.functions.isFieldValid($scope.active.startField) && $scope.functions.isFieldValid($scope.active.endField);
    };

    $scope.functions.getFilterFields = function() {
        return [{
            columnName: "_id",
            prettyName: "ID"
        }];
    };

    $scope.functions.removeFilterValues = function() {
        $scope.filter = undefined;
    };

    $scope.functions.createNeonFilterClause = function(databaseAndTables, fieldName) {
        return neon.query.where(fieldName, '=', $scope.filter);
    };

    $scope.functions.createFilterTrayText = function() {
        return "_id = " + $scope.filter;
    };

    $scope.functions.shouldQueryAfterFilter = function() {
        return true;
    };

    $scope.functions.hideHeaders = function() {
        return $scope.functions.isFilterSet() || $scope.active.selectedGroups.length;
    };

    $scope.functions.createNeonQueryWhereClause = function() {
        if($scope.active.groupFields.length && $scope.functions.isFieldValid($scope.active.groupFields[0])) {
            var whereClauses = $scope.active.selectedGroups.map(function(group) {
                return neon.query.where($scope.active.groupFields[0].columnName, "=", group);
            }) || [];
            if(whereClauses.length) {
                return whereClauses.length === 1 ? whereClauses[0] : neon.query.or.apply(neon.query, whereClauses);
            }
        }
        return undefined;
    };

    $scope.functions.addToQuery = function(query) {
        var fields = [$scope.active.startField.columnName, $scope.active.endField.columnName];
        if($scope.functions.isFieldValid($scope.active.colorField)) {
            fields.push($scope.active.colorField.columnName);
        }
        if($scope.functions.isFieldValid($scope.active.titleField)) {
            fields.push($scope.active.titleField.columnName);
        }
        $scope.active.groupFields.forEach(function(groupField) {
            fields.push(groupField.columnName);
        });
        query.withFields(fields);
        return query;
    };

    $scope.functions.updateData = function(data) {
        $scope.active.legend = [];

        var colorScale = d3.scale.ordinal().range(neonColors.LIST);
        var colors = [];
        var chartData = data || [];
        var groupsToColors = {};

        if($scope.functions.isFieldValid($scope.active.colorField)) {
            groupsToColors = $scope.functions.getColorMaps($scope.active.colorField);
            if(Object.keys(groupsToColors).length) {
                Object.keys(groupsToColors).forEach(function(group) {
                    $scope.active.legend.push({
                        color: groupsToColors[group],
                        text: group
                    });
                });
            } else {
                colors = createFieldValueList($scope.active.colorField.columnName, chartData);
                colors.forEach(function(color, index) {
                    $scope.active.legend.push({
                        color: colorScale(index),
                        text: color
                    });
                });
            }
        }

        $scope.active.data = [];
        $scope.tree = {};
        if($scope.active.groupFields.length) {
            buildTree(chartData);
        }

        chartData.forEach(function(item, index) {
            var treeParent;
            if($scope.active.groupFields.length) {
                treeParent = getTreeParent(item);
            } else {
                treeParent = {
                    tasks: []
                };
                $scope.active.data.push(treeParent);
            }

            var color;
            var colorFieldValue = neon.helpers.getNestedValue(item, $scope.active.colorField.columnName);
            if(Object.keys(groupsToColors).length) {
                color = groupsToColors[colorFieldValue] || neonColors.DEFAULT;
            } else if(colors.length) {
                color = colorScale(colors.indexOf(colorFieldValue));
            } else {
                color = colorScale(index);
            }

            treeParent.tasks.push({
                id: item._id,
                name: $scope.functions.isFieldValid($scope.active.titleField) ? neon.helpers.getNestedValue(item, $scope.active.titleField.columnName) : "",
                from: neon.helpers.getNestedValue(item, $scope.active.startField.columnName),
                to: neon.helpers.getNestedValue(item, $scope.active.endField.columnName),
                color: color
            });
        });

        if($scope.active.groupFields.length) {
            Object.keys($scope.tree).forEach(function(name) {
                saveTreeInData($scope.tree[name], name);
            });
            $scope.functions.getElement(".gantt-side").width(200);
        }
    };

    var createFieldValueList = function(field, data) {
        var list = [];
        data.forEach(function(item) {
            var value = neon.helpers.getNestedValue(item, field);
            if(list.indexOf(value) < 0) {
                list.push(value);
            }
        });
        return list;
    };

    var buildTree = function(data) {
        if($scope.active.groupFields.length) {
            data.forEach(function(item) {
                var groupValue = neon.helpers.getNestedValue(item, $scope.active.groupFields[0].columnName);
                $scope.tree[groupValue] = buildSubtree($scope.tree, item, 0);
            });
        }
    };

    var buildSubtree = function(tree, item, rowIndex) {
        var fieldValue = neon.helpers.getNestedValue(item, $scope.active.groupFields[rowIndex].columnName);
        if(rowIndex + 1 < $scope.active.groupFields.length) {
            tree[fieldValue] = tree[fieldValue] || {};
            tree[fieldValue][neon.helpers.getNestedValue(item, $scope.active.groupFields[rowIndex + 1].columnName)] = buildSubtree(tree[fieldValue], item, rowIndex + 1);
            return tree[fieldValue];
        }
        return tree[fieldValue] || {
            tasks: []
        };
    };

    var getTreeParent = function(item) {
        var treeParent = $scope.tree;
        $scope.active.groupFields.forEach(function(groupField) {
            treeParent = treeParent[neon.helpers.getNestedValue(item, groupField.columnName)];
        });
        return treeParent;
    };

    var saveTreeInData = function(tree, name, parentName) {
        $scope.active.data.push({
            name: name,
            parent: parentName,
            tasks: tree.tasks
        });
        if(!tree.tasks) {
            Object.keys(tree).forEach(function(childName) {
                saveTreeInData(tree[childName], childName, name);
            });
        }
    };

    $scope.handleChangeStartField = function() {
        $scope.functions.logChangeAndUpdate("startField", $scope.active.startField.columnName);
    };

    $scope.handleChangeEndField = function() {
        $scope.functions.logChangeAndUpdate("endField", $scope.active.endField.columnName);
    };

    $scope.handleChangeColorField = function() {
        $scope.functions.logChangeAndUpdate("colorField", $scope.active.colorField.columnName);
    };

    $scope.handleChangeTitleField = function() {
        $scope.functions.logChangeAndUpdate("titleField", $scope.active.titleField.columnName);
    };

    $scope.handleChangeGroupField = function(index, field) {
        // TODO Logging
        if($scope.functions.isFieldValid(field)) {
            $scope.active.groupFields[index] = field;
        } else {
            $scope.active.groupFields.splice(index, 1);
        }
        queryForSelectedGroups();
    };

    $scope.handleAddGroupField = function() {
        // TODO Logging
        if($scope.functions.isFieldValid($scope.active.newGroupField)) {
            $scope.active.groupFields.push($scope.active.newGroupField);
        }
        $scope.active.newGroupField = {};
        queryForSelectedGroups();
    };

    $scope.handleSelectGroup = function() {
        // TODO Logging
        if($scope.active.selectableGroups.indexOf($scope.active.selectedGroup) >= 0) {
            $scope.active.selectedGroups.push($scope.active.selectedGroup);
            $scope.functions.queryAndUpdate();
        }
        $scope.active.selectedGroup = "";
    };

    $scope.getFilterData = function() {
        return $scope.filter ? [$scope.filter] : [];
    };

    $scope.createFilterDesc = function(value) {
        return "_id = " + value;
    };

    $scope.getSelectedGroupNotificationData = function() {
        return $scope.active.selectedGroups;
    };

    $scope.createDeselectGroupDesc = function(value) {
        return "Deselect " + value;
    };

    $scope.removeSelectedGroups = function() {
        $scope.active.selectedGroups = [];
        $scope.functions.queryAndUpdate();
    };

    $scope.functions.addToBindings = function(bindings) {
        bindings.titleField = $scope.functions.isFieldValid($scope.active.titleField) ? $scope.active.titleField.columnName : undefined;
        bindings.startField = $scope.functions.isFieldValid($scope.active.startField) ? $scope.active.startField.columnName : undefined;
        bindings.endField = $scope.functions.isFieldValid($scope.active.endField) ? $scope.active.endField.columnName : undefined;
        bindings.colorField = $scope.functions.isFieldValid($scope.active.colorField) ? $scope.active.colorField.columnName : undefined;
        bindings.groupFields = $scope.active.groupFields || undefined;
        bindings.selectedGroups = $scope.active.selectedGroups || undefined;
        return bindings;
    };
}]);
