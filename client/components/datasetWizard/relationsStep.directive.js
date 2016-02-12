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
.directive('relationsStep', [
    function() {
    return {
        templateUrl: 'components/datasetWizard/relationsStep.html',
        restrict: 'E',
        require: '^wizard',
        scope: {
            stepNumber: '='
        },
        link: function($scope, $element, $attrs, wizardCtrl) {
            $scope.isSelected = false;
            $scope.customRelations = [];
            $scope.databases = [];
            $scope.selectedRelations = [];
            $scope.tooltip = "Each relation is in the form 'database : table : field'.";

            /**
             * Adds a new custom relation database element to the list of custom relation databases for the
             * selected relation.
             * @method addNewCustomRelation
             */
            $scope.addNewCustomRelation = function() {
                $scope.customRelations.push({
                    customRelationDatabases: $scope.selectedRelations
                });
                resetSelectedRelations();
            };

            /**
             * Adds a new relation database to the selected relation.
             * @method addRelationDatabase
             */
            $scope.addRelationDatabase = function() {
                $scope.selectedRelations.push({
                    database: {
                        name: "",
                        prettyName: ""
                    },
                    customRelationTables: []
                });
            };

            /**
             * Adds a new relation table for the selected relation database.
             * @param {Object} relationDatabase
             * @method addRelationTable
             */
            $scope.addRelationTable = function(relationDatabase) {
                relationDatabase.customRelationTables.unshift({
                    table: {
                        name: "",
                        prettyName: "",
                        fields: []
                    }
                });
            };

            /**
             * Removes the custom relations that are selected from the list of custom relations.
             * @method removeCustomRelations
             */
            $scope.removeCustomRelations = function() {
                var indices = [];
                _.each($scope.customRelations, function(relation, index) {
                    if(relation.selected) {
                        indices.push(index);
                    }
                });

                _.each(indices.reverse(), function(index) {
                    $scope.customRelations.splice(index, 1);
                });
            };

            /**
             * Removes the relation database at the given index from the selected relations list.
             * @param {Number} index
             * @method removeRelationDatabase
             */
            $scope.removeRelationDatabase = function(index) {
                $scope.selectedRelations.splice(index, 1);
            };

            /**
             * Removes the relation table at the given index from the selected relations list.
             * @param {Object} relationDatabase
             * @param {Number} index
             * @method removeRelationTable
             */
            $scope.removeRelationTable = function(relationDatabase, index) {
                if(index === 0 && relationDatabase.customRelationTables.length <= 1) {
                    return;
                }
                relationDatabase.customRelationTables.splice(index, 1);
            };

            /**
             * Selection event for the given relation database object.
             * @param {Object} relationDatabase
             * @method selectRelationDatabase
             */
            $scope.selectRelationDatabase = function(relationDatabase) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "relation-database-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", "relation", (relationDatabase.database ? relationDatabase.name : ""), "database"]
                });

                relationDatabase.customRelationTables = [{
                    table: {
                        name: "",
                        prettyName: "",
                        fields: []
                    }
                }];
            };

            /**
             * Selection event for the given relation table object.
             * @param {Object} relationTable
             * @method selectRelationTable
             */
            $scope.selectRelationTable = function(relationTable) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "relation-table-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", "relation", (relationTable.table ? relationTable.table.name : ""), "table"]
                });
            };

            /**
             * Selection event for the given relation field object.
             * @param {Object} relationField
             * @method selectRelationField
             */
            $scope.selectRelationField = function(relationField) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "relation-field-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", "relation", (relationField ? relationField.columnName : ""), "field"]
                });
            };

            /*
             * Returns whether the 'Add Relation' button should be disabled depending on if all the fields are filled in.
             * @return {Boolean}
             * @method addRelationButtonDisabled
             */
            $scope.addRelationButtonDisabled = function() {
                return !(_.all($scope.selectedRelations, function(relation) {
                    return relation.database && relation.database.name && _.all(relation.customRelationTables, function(relationTable) {
                        return relationTable.table && relationTable.table.name && relationTable.field && relationTable.field.columnName;
                    });
                }));
            };

            /*
             * Returns whether the 'Remove Selected' button should be disabled depending on if any custom
             * relations are selected.
             * @return {Boolean}
             * @method removeButtonDisabled
             */
            $scope.removeButtonDisabled = function() {
                return _.all($scope.customRelations, function(relation) {
                    return !relation.selected;
                });
            };

            /*
             * Resets the selected relations to its original state.
             * @method resetSelectedRelations
             * @private
             */
            var resetSelectedRelations = function() {
                $scope.selectedRelations = [{
                    database: {},
                    customRelationTables: []
                }];
            };

            /*
             * Returns whether she step is valid and can go on to the next step.
             * @return {Boolean}
             * @method validateStep
             * @private
             */
            var validateStep = function() {
                return true;
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
                $scope.customRelations = [];
                resetSelectedRelations();
            };

            /*
             * Function to call when the step finishes.
             * @method onFinish
             * @private
             */
            var onFinish = function() {
                wizardCtrl.setCustomRelations($scope.customRelations);
            };

            wizardCtrl.addStep({
                title: "Add Relations",
                stepNumber: $scope.stepNumber,
                validateStep: validateStep,
                selected: selected,
                init: init,
                onFinish: onFinish
            });
        }
    };
}]);
