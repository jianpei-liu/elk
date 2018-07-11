import template from './timelion_help.html';
import { uiModules } from 'ui/modules';
import _ from 'lodash';
import moment from 'moment';

const app = uiModules.get('apps/timelion', []);

app.directive('timelionHelp', function ($http) {
  return {
    restrict: 'E',
    template,
    controller: function ($scope) {
      $scope.functions = {
        list: [],
        details: null
      };

      function init() {
        $scope.es = {
          invalidCount: 0
        };
        getFunctions();
        checkElasticsearch();
      }

      function getFunctions() {
        return $http.get('../api/timelion/functions').then(function (resp) {
          $scope.functions.list = resp.data;
        });
      }
      $scope.recheckElasticsearch = function () {
        $scope.es.valid = null;
        checkElasticsearch().then(function (valid) {
          if (!valid) $scope.es.invalidCount++;
        });
      };

      function checkElasticsearch() {
        return $http.get('../api/timelion/validate/es').then(function (resp) {
          if (resp.data.ok) {

            $scope.es.valid = true;
            $scope.es.stats = {
              min: moment(resp.data.min).format('LLL'),
              max: moment(resp.data.max).format('LLL'),
              field: resp.data.field
            };
          } else {
            $scope.es.valid = false;
            $scope.es.invalidReason = (function () {
              try {
                const esResp = JSON.parse(resp.data.resp.response);
                return _.get(esResp, 'error.root_cause[0].reason');
              } catch (e) {
                if (_.get(resp, 'data.resp.message')) return _.get(resp, 'data.resp.message');
                if (_.get(resp, 'data.resp.output.payload.message')) return _.get(resp, 'data.resp.output.payload.message');
                return 'Unknown error';
              }
            }());
          }
          return $scope.es.valid;
        });
      }
      init();
    }
  };
});
