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
.directive('arrayTextForm', function() {
    return {
        templateUrl: "partials/directives/arrayTextForm.html",
        restrict: "E",
        scope: {
            fields: '=',
            allowMore: '=?',
            label: '=?',
            submitHandler: '=?'
        },
        link: function($scope) {
            if($scope.allowMore === undefined) {
                $scope.allowMore = true;
            }
            $scope.label = $scope.label || ($scope.allowMore ? "Fields" : "Field");

            $scope.addField = function() {
                $scope.fields.push("");
            };

            $scope.handleSubmit = function() {
                console.log("handling submit");
                if($scope.submitHandler) {
                    $scope.submitHandler.call(this);
                }
            };

            $scope.blur = function($event, $index) {
                if($event.currentTarget.value === "" && $scope.fields.length > 1) {
                    $scope.fields.splice($index, 1);
                } else {
                    $scope.fields[ $index ] = $event.currentTarget.value;
                }
                $scope.handleSubmit();
            };
        }
    };
});
