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
.directive('wizard', [
    function() {
    return {
        templateUrl: 'partials/dataset-wizard/wizardTemplate.html',
        restrict: 'E',
        transclude: true,
        scope: {
            onFinish: '=',
            totalSteps: '='
        },
        controller: ["$scope", function($scope) {
            $scope.totalSteps = $scope.totalSteps || 0;
            $scope.steps = _.range($scope.totalSteps);
            $scope.currentStep = {};
            $scope.currentStepNumber = 0;
            $scope.databases = [];
            $scope.customDatabases = [];
            $scope.customRelations = [];
            $scope.customVisualizations = [];
            $scope.datastore = {};

            /*
             * Adds a step to the wizard given the config for that step.
             * @param {Object} stepConfig
             * @param {String} stepConfig.title Title to display.
             * @param {Number} stepConfig.stepNumber Step number in the wizard.
             * @param {Function} stepConfig.selected Function to execute when the step is to be shown/hidden.
             * @param {Function} stepConfig.init Function to execute when the step is selected.
             * @param {Function} stepConfig.onFinish Function to execute when the step is finished.
             * @method addStep
             */
            this.addStep = function(stepConfig) {
                if(stepConfig.number > $scope.steps.length) {
                    $scope.steps.push(stepConfig);
                } else {
                    $scope.steps[stepConfig.stepNumber - 1] = stepConfig;
                }

                if(stepConfig.stepNumber === 1) {
                    $scope.currentStep = $scope.steps[0];
                    $scope.currentStepNumber = 1;
                    $scope.currentStep.selected(true);
                }
            };

            /*
             * Sets the datastore information.
             * @param {Object} datastore
             * @param {String} datastore.type
             * @param {String} datastore.host
             * @param {String} datastore.name
             * @method setDatastore
             */
            this.setDatastore = function(datastore) {
                $scope.datastore = datastore;
            };

            /*
             * Sets the list of databases.
             * @param {Array} databases
             * @method updateDatabases
             */
            this.updateDatabases = function(databases) {
                $scope.databases = databases;
            };

            /*
             * Sets the list of databases.
             * @param {Array} databases
             * @method updateDatabases
             */
            this.setCustomDatabases = function(customDatabases) {
                $scope.customDatabases = customDatabases;
            };

            /*
             * Sets the list of custom relations.
             * @param {Array} customRelations
             * @method setCustomRelations
             */
            this.setCustomRelations = function(customRelations) {
                $scope.customRelations = customRelations;
            };

            /*
             * Sets the list of custom visualizations.
             * @param {Array} customVisualizations
             * @method setCustomVisualizations
             */
            this.setCustomVisualizations = function(customVisualizations) {
                $scope.customVisualizations = customVisualizations;
            };

            /*
             * Advances the wizard to the next step. If there are no more steps, it finishes
             * the wizard by calling the onFinish function.
             * @method nextStep
             */
            $scope.nextStep = function() {
                if($scope.steps.length >= $scope.currentStepNumber + 1) {
                    $scope.currentStep.selected(false);
                    if($scope.currentStep.onFinish) {
                        $scope.currentStep.onFinish();
                    }
                    $scope.currentStep = $scope.steps[$scope.currentStepNumber];

                    $scope.currentStepNumber++;
                    $scope.currentStep.selected(true);
                    $scope.currentStep.init($scope.databases, $scope.customDatabases, $scope.datastore);
                } else {
                    $scope.currentStep.selected(false);
                    $scope.currentStep.onFinish();

                    $scope.onFinish({
                        customDatabases: $scope.customDatabases,
                        customRelations: $scope.customRelations,
                        customVisualizations: $scope.customVisualizations,
                        datastoreType: $scope.datastore.type,
                        datastoreHost: $scope.datastore.host,
                        datasetName: $scope.datastore.name
                    });

                    resetWizard();
                }
            };

            /*
             * Goes back one step in the wizard, if allowed.
             * @method previousStep
             */
            $scope.previousStep = function() {
                if($scope.currentStepNumber > 1) {
                    $scope.currentStep.selected(false);

                    $scope.currentStepNumber--;
                    $scope.currentStep = $scope.steps[$scope.currentStepNumber - 1];
                    $scope.currentStep.selected(true);
                }
            };

            /*
             * Resets the wizard to its original state.
             * @method resetWizard
             * @private
             */
            var resetWizard = function() {
                $scope.currentStep = $scope.steps[0];
                $scope.currentStep.selected(true);
                $scope.currentStep.init();
                $scope.currentStepNumber = 1;
                $scope.databases = [];
                $scope.customDatabases = [];
                $scope.customRelations = [];
                $scope.customVisualizations = [];
                $scope.datastore = {};
            };
        }]
    };
}]);
