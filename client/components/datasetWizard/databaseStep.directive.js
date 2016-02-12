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
angular.module('neonDemo.directives')
.directive('databaseStep', [
    function() {
    return {
        templateUrl: 'components/datasetWizard/databaseStep.html',
        restrict: 'E',
        require: '^wizard',
        scope: {
            stepNumber: '='
        },
        link: function($scope, $element, $attrs, wizardCtrl) {
            $scope.isSelected = false;
            $scope.customDatabases = [];
            $scope.databases = [];
            $scope.selectedDatabase = {};
            $scope.tooltip = "Each set is in the form 'database : table'.";

            /**
             * Selection event for the selected database object.
             * @method selectDatabase
             */
            $scope.selectDatabase = function() {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "database-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", ($scope.selectedDatabase.database ? $scope.selectedDatabase.database.name : ""), "database"]
                });

                $scope.selectedDatabase.selectedTable = {
                    table: {
                        name: "",
                        prettyName: ""
                    }
                };
            };

            /**
             * Selection event for the selected table object.
             * @method selectTable
             */
            $scope.selectTable = function() {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "table-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", ($scope.selectedDatabase.selectedTable.table ?
                        $scope.selectedDatabase.selectedTable.table.name : ""), "table"]
                });
            };

            /**
             * Adds a new custom database element to the global list of custom databases.
             * @method addNewCustomDatabase
             */
            $scope.addNewCustomDatabase = function() {
                var customDB = _.find($scope.customDatabases, function(db) {
                    return db.database.name === $scope.selectedDatabase.database.name;
                });

                if(customDB) {
                    var customTb = _.find(customDB.customTables, function(tb) {
                        return tb.table.name === $scope.selectedDatabase.selectedTable.table.name;
                    });
                    if(!customTb) {
                        customDB = addNewCustomTable(customDB);
                    }
                } else {
                    var customDatabase = {
                        database: $scope.selectedDatabase.database,
                        customTables: []
                    };
                    $scope.customDatabases.push(addNewCustomTable(customDatabase));
                }
                resetSelectedDatabase();
            };

            /**
             * Removes the custom database elements that are selected from the global list of custom databases.
             * @method removeCustomDatabase
             */
            $scope.removeCustomDatabases = function() {
                var emptyDBIndices = [];

                _.each($scope.customDatabases, function(db, dbIndex) {
                    db = removeCustomTable(db);

                    if(!db.customTables.length) {
                        emptyDBIndices.push(dbIndex);
                    }
                });

                _.each(emptyDBIndices.reverse(), function(index) {
                    $scope.customDatabases.splice(index, 1);
                });
            };

            /**
             * Returns whether the 'Remove Selected' button should be disabled depending on if any custom
             * databases are selected.
             * @return {Boolean}
             * @method removeButtonDisabled
             */
            $scope.removeButtonDisabled = function() {
                return _.all($scope.customDatabases, function(db) {
                    return _.all(db.customTables, function(table) {
                        return !table.selected;
                    });
                });
            };

            /**
             * Adds a new custom table element to the list of custom tables for the given custom database and returns the custom database.
             * @param {Object} customDatabase
             * @return {Object}
             * @method addNewCustomTable
             * @private
             */
            var addNewCustomTable = function(customDatabase) {
                customDatabase.customTables.push($scope.selectedDatabase.selectedTable);
                return customDatabase;
            };

            /**
             * Removes the custom table elements that are selected from the list of custom tables for the given custom database element.
             * @param {Object} customDatabase
             * @return {Object}
             * @method removeCustomTable
             * @private
             */
            var removeCustomTable = function(customDatabase) {
                var indices = [];

                _.each(customDatabase.customTables, function(tb, index) {
                    if(tb.selected) {
                        indices.push(index);
                    }
                });

                _.each(indices.reverse(), function(index) {
                    customDatabase.customTables.splice(index, 1);
                });

                return customDatabase;
            };

            /*
             * Resets the selected database to its original state.
             * @method resetSelectedDatabase
             * @private
             */
            var resetSelectedDatabase = function() {
                $scope.selectedDatabase = {
                    database: {},
                    selectedTable: {}
                };
            };

            /*
             * Returns whether she step is valid and can go on to the next step.
             * @return {Boolean}
             * @method validateStep
             * @private
             */
            var validateStep = function() {
                return ($scope.customDatabases.length > 0 && $scope.customDatabases[0].customTables.length > 0);
            };

            /*
             * Shows/hides this step.
             * @param {Boolean} selected
             * @method selected
             * @private
             */
            var selected = function(selected) {
                $scope.isSelected = selected;
            };

            /*
             * Function to call on step initialization.
             * @method init
             * @private
             */
            var init = function(databases) {
                $scope.databases = databases;
                $scope.customDatabases = [];
                resetSelectedDatabase();
            };

            /*
             * Function to call when the step finishes.
             * @method onFinish
             * @private
             */
            var onFinish = function() {
                wizardCtrl.setCustomDatabases($scope.customDatabases);
            };

            wizardCtrl.addStep({
                title: "Add Databases",
                stepNumber: $scope.stepNumber,
                validateStep: validateStep,
                selected: selected,
                init: init,
                onFinish: onFinish
            });
        }
    };
}]);
